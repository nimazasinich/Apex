"""UI-aware visual regression analysis for screenshots.

Install: ``pip install pillow numpy scipy``

This module intentionally stays self-contained: it does not need an API, an ML
model, OpenCV, or scikit-image.  It is designed for comparing a visual reference
against a live dashboard where prices, timestamps, counters and sparklines may
legitimately change.  It combines alignment, dynamic-content masking, perceptual
similarity, edge geometry and connected-component triage instead of trusting a
single raw pixel-difference number.

Quick use
---------
``python apex_visual_diff.py reference.png achieved.png --out qa``

For dashboards, use a JSON spec (see ``--help``) to supply named regions and
dynamic masks.  The report is written to ``qa/report.json`` and can be consumed
by a CI job or handed directly to a developer.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


Box = tuple[int, int, int, int]  # (left, top, right, bottom), pixels
NormalizedBox = tuple[float, float, float, float]  # same order, 0..1


# ---------------------------------------------------------------------------
# Basic image and coordinate helpers
# ---------------------------------------------------------------------------

def _load_arr(image_path: str | Path, box: Optional[Box] = None) -> np.ndarray:
    """Load an image as an RGB integer array, optionally cropped safely."""
    img = Image.open(image_path).convert("RGB")
    if box is not None:
        img = img.crop(_clamp_box(box, img.size))
    return np.asarray(img, dtype=np.int16)


def _load_image(image_path: str | Path, box: Optional[Box] = None) -> Image.Image:
    img = Image.open(image_path).convert("RGB")
    return img.crop(_clamp_box(box, img.size)) if box else img


def _clamp_box(box: Box, size: tuple[int, int]) -> Box:
    w, h = size
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    x0, x1 = sorted((max(0, min(w, x0)), max(0, min(w, x1))))
    y0, y1 = sorted((max(0, min(h, y0)), max(0, min(h, y1))))
    if x1 <= x0 or y1 <= y0:
        raise ValueError(f"Invalid/empty box {box!r} for image size {size!r}")
    return x0, y0, x1, y1


def normalized_box(box: Box, size: tuple[int, int]) -> NormalizedBox:
    """Convert absolute coordinates into viewport-independent coordinates."""
    x0, y0, x1, y1 = _clamp_box(box, size)
    w, h = size
    return x0 / w, y0 / h, x1 / w, y1 / h


def denormalized_box(box: Sequence[float], size: tuple[int, int]) -> Box:
    """Convert 0..1 coordinates to absolute pixels in a screenshot."""
    if len(box) != 4 or not all(0 <= float(v) <= 1 for v in box):
        raise ValueError("A normalized box must contain four values in the 0..1 range")
    w, h = size
    return _clamp_box((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)), size)


def map_box_between_viewports(box: Box, source_size: tuple[int, int], target_size: tuple[int, int]) -> Box:
    """Map a box by normalized viewport coordinates, never by a guessed DPR."""
    return denormalized_box(normalized_box(box, source_size), target_size)


def crop_and_save(image_path: str, box: Box, out_path: str) -> Image.Image:
    crop = _load_image(image_path, box)
    crop.save(out_path)
    return crop


def _gray(arr: np.ndarray) -> np.ndarray:
    return arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722


def _saturation_mask(arr: np.ndarray, sat_thresh: int = 25, val_thresh: int = 50) -> np.ndarray:
    max_c, min_c = arr.max(axis=2), arr.min(axis=2)
    return ((max_c - min_c) > sat_thresh) & (max_c > val_thresh)


def _ensure_same_size(reference: np.ndarray, achieved: np.ndarray) -> np.ndarray:
    if reference.shape[:2] == achieved.shape[:2]:
        return achieved
    h, w = reference.shape[:2]
    return np.asarray(Image.fromarray(achieved.astype(np.uint8)).resize((w, h), Image.Resampling.BICUBIC), dtype=np.int16)


# ---------------------------------------------------------------------------
# Existing focused probes (kept API-compatible)
# ---------------------------------------------------------------------------

def locate_colorful_cluster(
    image_path: str, search_box: Box, sat_thresh: int = 25, val_thresh: int = 50,
    bins: int = 20, pad: int = 10,
) -> Optional[Box]:
    """Find the densest connected cluster of saturated pixels in a search area."""
    arr = _load_arr(image_path, search_box)
    mask = _saturation_mask(arr, sat_thresh, val_thresh)
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=int))
    if count == 0:
        return None
    objects = ndimage.find_objects(labels)
    candidates: list[tuple[int, tuple[slice, slice]]] = []
    for index, slc in enumerate(objects, start=1):
        if slc is None:
            continue
        area = int((labels[slc] == index).sum())
        if area:
            candidates.append((area, slc))
    if not candidates:
        return None
    _, (ys, xs) = max(candidates, key=lambda item: item[0])
    x0, y0, x1, y1 = xs.start, ys.start, xs.stop, ys.stop
    left, top, _, _ = _clamp_box(search_box, Image.open(image_path).size)
    return (left + x0 - pad, top + y0 - pad, left + x1 + pad, top + y1 + pad)


@dataclass
class AngleSample:
    angle_start: float
    angle_end: float
    rgb: tuple[float, float, float]
    n_pixels: int


def sample_ring_by_angle(
    image_path: str, box: Box, n_bins: int = 16, sat_thresh: int = 25, val_thresh: int = 50,
) -> list[AngleSample]:
    arr = _load_arr(image_path, box)
    mask = _saturation_mask(arr, sat_thresh, val_thresh)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return []
    cx, cy = xs.mean(), ys.mean()
    angles = np.degrees(np.arctan2(ys - cy, xs - cx))
    edges = np.linspace(-180, 180, n_bins + 1)
    index = np.digitize(angles, edges)
    out: list[AngleSample] = []
    for i in range(1, n_bins + 1):
        selected = index == i
        if selected.any():
            pixels = arr[ys[selected], xs[selected]]
            out.append(AngleSample(float(edges[i - 1]), float(edges[i]), tuple(map(float, pixels.mean(axis=0))), int(selected.sum())))
    return out


def sample_column(image_path: str, x: int, y0: int, y1: int, step: int = 5):
    image = _load_image(image_path)
    return [(y, image.getpixel((x, y))) for y in range(y0, y1, step)]


def sample_row(image_path: str, y: int, x0: int, x1: int, step: int = 5):
    image = _load_image(image_path)
    return [(x, image.getpixel((x, y))) for x in range(x0, x1, step)]


def detect_gradient_direction(image_path: str, box: Box, sat_thresh: int = 15, val_thresh: int = 30) -> dict:
    arr = _load_arr(image_path, box)
    mask = _saturation_mask(arr, sat_thresh, val_thresh)
    if mask.sum() < 10:
        return {"verdict": "no_colorful_pixels", "n_pixels": int(mask.sum())}
    lum = _gray(arr)
    # Avoid NaN means on empty rows/columns: rings and icons naturally leave
    # most scan lines without a colorful pixel.
    row_counts, col_counts = mask.sum(axis=1), mask.sum(axis=0)
    row_means = np.divide((lum * mask).sum(axis=1), row_counts, out=np.zeros_like(row_counts, dtype=float), where=row_counts > 0)
    col_means = np.divide((lum * mask).sum(axis=0), col_counts, out=np.zeros_like(col_counts, dtype=float), where=col_counts > 0)
    row_var = float(np.var(row_means[row_counts > 0]))
    col_var = float(np.var(col_means[col_counts > 0]))
    ys, xs = np.where(mask)
    radii = np.hypot(xs - xs.mean(), ys - ys.mean())
    groups = np.digitize(radii, np.linspace(radii.min(), radii.max() + 1, 8))
    values = [lum[ys[groups == i], xs[groups == i]].mean() for i in range(1, 8) if (groups == i).any()]
    scores = {"vertical": row_var, "horizontal": col_var, "radial": float(np.var(values)) if len(values) > 1 else 0.0}
    return {"verdict": max(scores, key=scores.get) if max(scores.values()) >= 4 else "flat", "scores": scores, "n_pixels": int(mask.sum())}


def extract_palette(image_path: str, box: Box, n_colors: int = 5) -> list[tuple[int, int, int]]:
    image = _load_image(image_path, box).quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    palette, counts = image.getpalette(), sorted(image.getcolors(), reverse=True)
    return [tuple(palette[index * 3:index * 3 + 3]) for _, index in counts[:n_colors]]


def flat_vs_gradient(image_path: str, box: Box, std_thresh: float = 8.0) -> dict:
    arr = _load_arr(image_path, box)
    mask = _saturation_mask(arr, 20, 40)
    if mask.sum() < 10:
        return {"verdict": "no_colorful_pixels"}
    pixels = arr[mask]
    stds = tuple(map(float, pixels.std(axis=0)))
    return {"verdict": "gradient" if max(stds) > std_thresh else "flat_fill", "channel_stds": stds,
            "mean_rgb": tuple(map(float, pixels.mean(axis=0))), "n_pixels": int(mask.sum()), "palette": extract_palette(image_path, box, 4)}


def measure_curve_smoothness(image_path: str, box: Box, sat_thresh: int = 15, val_thresh: int = 30) -> dict:
    arr = _load_arr(image_path, box)
    mask = _saturation_mask(arr, sat_thresh, val_thresh)
    ys = np.array([np.where(mask[:, x])[0].mean() if mask[:, x].any() else np.nan for x in range(mask.shape[1])])
    valid = ~np.isnan(ys)
    if valid.sum() < 5:
        return {"verdict": "insufficient_line_pixels", "n_points": int(valid.sum())}
    clean = ys[valid]
    first, second = np.diff(clean), np.diff(clean, n=2)
    roughness = float(np.mean(np.abs(second))) if len(second) else 0.0
    jump = float(np.max(np.abs(first))) if len(first) else 0.0
    return {"verdict": "jagged" if roughness > 3 or jump > mask.shape[0] * .25 else "smooth", "roughness": roughness, "max_jump": jump, "n_points": int(valid.sum())}


def find_text_sharpness(image_path: str, box: Box) -> dict:
    laplacian = ndimage.laplace(_gray(_load_arr(image_path, box)))
    variance = float(laplacian.var())
    return {"verdict": "sharp" if variance > 50 else "blurry_or_soft", "laplacian_variance": variance}


def detect_active_state_diff(before_path: str, after_path: str, box: Box) -> dict:
    before = locate_colorful_cluster(before_path, box) or box
    after = locate_colorful_cluster(after_path, box) or box
    bw, bh = before[2] - before[0], before[3] - before[1]
    aw, ah = after[2] - after[0], after[3] - after[1]
    size_change = abs(aw * ah - bw * bh) / max(bw * bh, 1) * 100
    a, b = _load_arr(before_path, before), _load_arr(after_path, after)
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
    brightness = abs(float(a[:h, :w].mean()) - float(b[:h, :w].mean())) / max(float(a[:h, :w].mean()), 1) * 100
    return {"verdict": "scale_or_transform_detected" if size_change > 3 else "brightness_only_or_no_change", "before_box": before, "after_box": after, "size_change_pct": size_change, "brightness_change_pct": brightness}


# ---------------------------------------------------------------------------
# UI-aware comparison engine
# ---------------------------------------------------------------------------

@dataclass
class ComparisonConfig:
    pixel_threshold: float = 22.0
    component_min_area: int = 80
    auto_align: bool = True
    max_auto_shift_px: int = 18
    downsample_levels: int = 3


def _phase_translation(reference: np.ndarray, achieved: np.ndarray, max_shift: int) -> tuple[int, int]:
    """Estimate a small translation with FFT phase correlation.

    The result is validated by the caller, so a false peak cannot silently make
    a comparison worse.  This handles a screenshot crop shifted by a few pixels
    but deliberately does not try to warp a layout into looking correct.
    """
    ref = _gray(reference).astype(float)
    ach = _gray(achieved).astype(float)
    ref, ach = ref - ref.mean(), ach - ach.mean()
    cross = np.fft.fft2(ref) * np.conj(np.fft.fft2(ach))
    cross /= np.maximum(np.abs(cross), 1e-12)
    peak = np.unravel_index(np.argmax(np.abs(np.fft.ifft2(cross))), ref.shape)
    dy, dx = int(peak[0]), int(peak[1])
    if dy > ref.shape[0] // 2: dy -= ref.shape[0]
    if dx > ref.shape[1] // 2: dx -= ref.shape[1]
    return int(np.clip(dx, -max_shift, max_shift)), int(np.clip(dy, -max_shift, max_shift))


def _shift_and_score(reference: np.ndarray, achieved: np.ndarray, dx: int, dy: int) -> tuple[np.ndarray, float]:
    shifted = ndimage.shift(achieved, shift=(dy, dx, 0), order=1, mode="nearest")
    margin = max(abs(dx), abs(dy), 2)
    ref_core, ach_core = reference[margin:-margin, margin:-margin], shifted[margin:-margin, margin:-margin]
    return shifted.astype(np.int16), float(np.abs(ref_core - ach_core).mean())


def auto_register(reference: np.ndarray, achieved: np.ndarray, max_shift_px: int = 18) -> tuple[np.ndarray, dict[str, Any]]:
    """Apply only a beneficial small translation; otherwise retain the original."""
    achieved = _ensure_same_size(reference, achieved)
    base_score = float(np.abs(reference - achieved).mean())
    dx, dy = _phase_translation(reference, achieved, max_shift_px)
    candidates = [(0, 0), (dx, dy), (-dx, -dy)]
    tested = [(candidate, *_shift_and_score(reference, achieved, *candidate)) for candidate in candidates]
    (chosen_dx, chosen_dy), aligned, score = min(tested, key=lambda item: item[2])
    use = (chosen_dx, chosen_dy) != (0, 0) and score < base_score * .99
    return (aligned if use else achieved), {"applied": use, "dx": chosen_dx if use else 0, "dy": chosen_dy if use else 0, "mae_before": base_score, "mae_after": score if use else base_score}


def build_dynamic_mask(size: tuple[int, int], boxes: Iterable[Box | NormalizedBox] = (), normalized: bool = False, padding: int = 0) -> np.ndarray:
    """Return True where content is intentionally dynamic and must be ignored."""
    mask = np.zeros((size[1], size[0]), dtype=bool)
    for raw_box in boxes:
        box = denormalized_box(raw_box, size) if normalized else _clamp_box(tuple(map(int, raw_box)), size)
        x0, y0, x1, y1 = box
        mask[max(0, y0-padding):min(size[1], y1+padding), max(0, x0-padding):min(size[0], x1+padding)] = True
    return mask


def _ssim(reference: np.ndarray, achieved: np.ndarray, valid: np.ndarray) -> float:
    """Gaussian-window SSIM implemented locally to avoid a heavy dependency."""
    x, y = _gray(reference).astype(float), _gray(achieved).astype(float)
    ux, uy = ndimage.gaussian_filter(x, 1.5), ndimage.gaussian_filter(y, 1.5)
    vx = ndimage.gaussian_filter(x * x, 1.5) - ux * ux
    vy = ndimage.gaussian_filter(y * y, 1.5) - uy * uy
    vxy = ndimage.gaussian_filter(x * y, 1.5) - ux * uy
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    score = ((2 * ux * uy + c1) * (2 * vxy + c2)) / ((ux * ux + uy * uy + c1) * (vx + vy + c2) + 1e-12)
    return float(score[valid].mean()) if valid.any() else float("nan")


def multiscale_ssim(reference: np.ndarray, achieved: np.ndarray, valid: np.ndarray, levels: int = 3) -> float:
    """Average SSIM over several scales, robust to anti-aliasing/DPR differences."""
    scores: list[float] = []
    ref, ach, mask = reference, achieved, valid
    for _ in range(max(1, levels)):
        if min(ref.shape[:2]) < 32 or not mask.any(): break
        scores.append(_ssim(ref, ach, mask))
        ref = ndimage.zoom(ref, (0.5, 0.5, 1), order=1)
        ach = ndimage.zoom(ach, (0.5, 0.5, 1), order=1)
        mask = ndimage.zoom(mask.astype(float), .5, order=0) > .5
    return float(np.nanmean(scores)) if scores else float("nan")


def _edge_map(arr: np.ndarray) -> np.ndarray:
    gray = _gray(arr).astype(float)
    magnitude = np.hypot(ndimage.sobel(gray, axis=0), ndimage.sobel(gray, axis=1))
    threshold = max(float(np.percentile(magnitude, 80)), 12.0)
    return magnitude >= threshold


def edge_geometry_score(reference: np.ndarray, achieved: np.ndarray, valid: Optional[np.ndarray] = None) -> dict[str, float]:
    """Compare layout/border geometry using tolerant edge precision and recall."""
    a, b = _edge_map(reference), _edge_map(achieved)
    if valid is not None:
        a, b = a & valid, b & valid
    dilated_a, dilated_b = ndimage.binary_dilation(a, iterations=1), ndimage.binary_dilation(b, iterations=1)
    precision = float((b & dilated_a).sum() / max(b.sum(), 1))
    recall = float((a & dilated_b).sum() / max(a.sum(), 1))
    f1 = 2 * precision * recall / max(precision + recall, 1e-12)
    return {"edge_precision": precision, "edge_recall": recall, "edge_f1": float(f1)}


def _difference_components(diff: np.ndarray, valid: np.ndarray, threshold: float, min_area: int) -> list[dict[str, Any]]:
    active = (diff >= threshold) & valid
    active = ndimage.binary_opening(active, structure=np.ones((2, 2)))
    active = ndimage.binary_closing(active, structure=np.ones((3, 3)))
    labels, count = ndimage.label(active, structure=np.ones((3, 3), dtype=int))
    components: list[dict[str, Any]] = []
    for index, slc in enumerate(ndimage.find_objects(labels), start=1):
        if slc is None: continue
        pixels = labels[slc] == index
        area = int(pixels.sum())
        if area < min_area: continue
        y0, y1, x0, x1 = slc[0].start, slc[0].stop, slc[1].start, slc[1].stop
        local = diff[slc][pixels]
        components.append({"box": (x0, y0, x1, y1), "area": area, "mean_diff": float(local.mean()), "severity": float(area * local.mean())})
    return sorted(components, key=lambda component: component["severity"], reverse=True)


def _diagnose(metrics: dict[str, Any], component_count: int) -> list[str]:
    advice: list[str] = []
    alignment = metrics["alignment"]
    if alignment["applied"]:
        advice.append("A small screenshot offset was removed before scoring; capture both images at the same viewport for stricter CI.")
    if metrics["edge_geometry"]["edge_f1"] < .70:
        advice.append("Geometry mismatch is material: check grid widths, card bounds, borders, radii and control positions before tuning colors.")
    if metrics["ms_ssim"] < .82 and metrics["edge_geometry"]["edge_f1"] >= .70:
        advice.append("Structure is mostly aligned but surfaces differ: inspect fills, gradients, shadows and opacity.")
    if metrics["masked_fraction"] > .20:
        advice.append("More than 20% is masked as dynamic; keep masks tight or fixed-layout regressions may be hidden.")
    if component_count > 12:
        advice.append("Many isolated discrepancies were found; inspect font loading, DPR/zoom, and anti-aliasing before changing individual components.")
    if not advice:
        advice.append("No dominant failure mode detected; use the top discrepancy boxes to prioritize the next visual pass.")
    return advice


def _save_artifacts(reference: np.ndarray, achieved: np.ndarray, diff: np.ndarray, components: list[dict[str, Any]], out_dir: Path, threshold: float) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    heat = np.clip((diff / max(float(np.percentile(diff, 99)), 1)) * 255, 0, 255).astype(np.uint8)
    heat_rgb = np.stack((heat, (heat * .18).astype(np.uint8), np.zeros_like(heat)), axis=2)
    Image.fromarray(heat_rgb).save(out_dir / "heatmap.png")
    overlay = (achieved.astype(float) * .54 + heat_rgb.astype(float) * .46).clip(0, 255).astype(np.uint8)
    image = Image.fromarray(overlay)
    draw = ImageDraw.Draw(image)
    for i, component in enumerate(components[:12], start=1):
        x0, y0, x1, y1 = component["box"]
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), outline=(255, 222, 35), width=2)
        draw.text((x0 + 3, y0 + 2), str(i), fill=(255, 240, 90))
    image.save(out_dir / "overlay.png")
    Image.fromarray(reference.astype(np.uint8)).save(out_dir / "reference_normalized.png")
    Image.fromarray(achieved.astype(np.uint8)).save(out_dir / "achieved_normalized.png")
    return {"heatmap": str(out_dir / "heatmap.png"), "overlay": str(out_dir / "overlay.png"), "reference_normalized": str(out_dir / "reference_normalized.png"), "achieved_normalized": str(out_dir / "achieved_normalized.png")}


def compare_ui_screenshots(
    reference_path: str | Path,
    achieved_path: str | Path,
    *,
    reference_box: Optional[Box] = None,
    achieved_box: Optional[Box] = None,
    dynamic_masks: Iterable[Box | NormalizedBox] = (),
    masks_are_normalized: bool = True,
    out_dir: str | Path | None = None,
    config: ComparisonConfig = ComparisonConfig(),
) -> dict[str, Any]:
    """Perform a UI-aware screenshot comparison and return JSON-safe evidence.

    Dynamic masks should normally be normalized coordinates from the *reference*
    viewport. They are applied after both images are resized to the reference
    region, which makes the same spec work across different DPR captures.
    """
    ref_image, ach_image = _load_image(reference_path), _load_image(achieved_path)
    ref_box = _clamp_box(reference_box, ref_image.size) if reference_box else (0, 0, *ref_image.size)
    ach_box = _clamp_box(achieved_box, ach_image.size) if achieved_box else (0, 0, *ach_image.size)
    reference = _load_arr(reference_path, ref_box)
    achieved = _ensure_same_size(reference, _load_arr(achieved_path, ach_box))
    alignment = {"applied": False, "dx": 0, "dy": 0, "mae_before": float(np.abs(reference - achieved).mean()), "mae_after": float(np.abs(reference - achieved).mean())}
    if config.auto_align:
        achieved, alignment = auto_register(reference, achieved, config.max_auto_shift_px)
    ignored = build_dynamic_mask((reference.shape[1], reference.shape[0]), dynamic_masks, normalized=masks_are_normalized)
    valid = ~ignored
    diff = np.abs(reference - achieved).mean(axis=2)
    components = _difference_components(diff, valid, config.pixel_threshold, config.component_min_area)
    pixel_metrics = {"mean_abs_diff": float(diff[valid].mean()) if valid.any() else float("nan"), "max_abs_diff": float(diff[valid].max()) if valid.any() else float("nan"), "pct_pixels_changed": float((diff[valid] >= config.pixel_threshold).mean() * 100) if valid.any() else float("nan")}
    metrics: dict[str, Any] = {"reference_size": list(ref_image.size), "achieved_size": list(ach_image.size), "comparison_size": [int(reference.shape[1]), int(reference.shape[0])], "reference_box": ref_box, "achieved_box": ach_box, "alignment": alignment, "masked_fraction": float(ignored.mean()), "pixel": pixel_metrics, "ms_ssim": multiscale_ssim(reference, achieved, valid, config.downsample_levels), "edge_geometry": edge_geometry_score(reference, achieved, valid)}
    metrics["verdict"] = "pass" if metrics["ms_ssim"] >= .92 and pixel_metrics["pct_pixels_changed"] < 8 else "review"
    metrics["components"] = components[:30]
    metrics["advice"] = _diagnose(metrics, len(components))
    if out_dir:
        metrics["artifacts"] = _save_artifacts(reference, achieved, diff, components, Path(out_dir), config.pixel_threshold)
    return metrics


def compare_named_regions(reference_path: str | Path, achieved_path: str | Path, regions: Sequence[dict[str, Any]], *, out_dir: str | Path | None = None, config: ComparisonConfig = ComparisonConfig()) -> dict[str, Any]:
    """Compare declarative named regions and rank them by visual risk.

    Each item accepts ``name``, ``reference_box`` and optionally
    ``achieved_box``.  Boxes may be absolute coordinates or normalized boxes
    when ``normalized: true`` is present.  Per-region ``dynamic_masks`` are
    supported and use the same coordinate system as their region.
    """
    ref_size, ach_size = _load_image(reference_path).size, _load_image(achieved_path).size
    results: list[dict[str, Any]] = []
    for item in regions:
        name = str(item.get("name", f"region-{len(results)+1}"))
        normalized = bool(item.get("normalized", False))
        raw_ref = item["reference_box"]
        ref_box = denormalized_box(raw_ref, ref_size) if normalized else tuple(map(int, raw_ref))
        raw_ach = item.get("achieved_box")
        ach_box = (denormalized_box(raw_ach, ach_size) if normalized and raw_ach else tuple(map(int, raw_ach))) if raw_ach else map_box_between_viewports(ref_box, ref_size, ach_size)
        region_dir = Path(out_dir) / name.replace("/", "_") if out_dir else None
        result = compare_ui_screenshots(reference_path, achieved_path, reference_box=ref_box, achieved_box=ach_box, dynamic_masks=item.get("dynamic_masks", ()), masks_are_normalized=normalized, out_dir=region_dir, config=config)
        result["name"] = name
        result["risk_score"] = round((1 - result["ms_ssim"]) * 100 + (1 - result["edge_geometry"]["edge_f1"]) * 50 + result["pixel"]["pct_pixels_changed"] * .5, 2)
        results.append(result)
    ranked = sorted(results, key=lambda item: item["risk_score"], reverse=True)
    return {"regions": ranked, "priority_order": [item["name"] for item in ranked]}


def pixel_diff_heatmap(reference_path: str, ref_box: Box, achieved_path: str, achieved_box: Box, out_path: str) -> dict:
    """Legacy helper: create a heatmap while reporting perceptual metrics too."""
    output = Path(out_path)
    result = compare_ui_screenshots(reference_path, achieved_path, reference_box=ref_box, achieved_box=achieved_box, out_dir=output.parent, config=ComparisonConfig(auto_align=False))
    generated = Path(result["artifacts"]["heatmap"])
    if generated != output:
        generated.replace(output)
    return {"mean_diff": result["pixel"]["mean_abs_diff"], "max_diff": result["pixel"]["max_abs_diff"], "pct_pixels_changed": result["pixel"]["pct_pixels_changed"], "ms_ssim": result["ms_ssim"], "edge_f1": result["edge_geometry"]["edge_f1"]}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _read_spec(path: str | Path) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Spec must be a JSON object")
    return data


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="UI-aware screenshot diff: alignment + masks + perceptual + geometry evidence")
    parser.add_argument("reference", help="reference screenshot")
    parser.add_argument("achieved", help="current screenshot")
    parser.add_argument("--out", default="visual-diff", help="directory for report.json, heatmap.png and overlay.png")
    parser.add_argument("--spec", help="JSON with dynamic_masks and/or regions; boxes are absolute unless normalized=true")
    parser.add_argument("--no-align", action="store_true", help="disable small-translation correction")
    parser.add_argument("--threshold", type=float, default=22.0, help="per-pixel discrepancy threshold (0..255)")
    args = parser.parse_args(argv)
    out_dir = Path(args.out)
    spec = _read_spec(args.spec) if args.spec else {}
    config = ComparisonConfig(pixel_threshold=args.threshold, auto_align=not args.no_align)
    if spec.get("regions"):
        result = compare_named_regions(args.reference, args.achieved, spec["regions"], out_dir=out_dir, config=config)
    else:
        result = compare_ui_screenshots(args.reference, args.achieved, dynamic_masks=spec.get("dynamic_masks", ()), masks_are_normalized=bool(spec.get("normalized", True)), out_dir=out_dir, config=config)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    if "priority_order" in result:
        print("Priority:", " -> ".join(result["priority_order"]))
    else:
        print(f"Verdict: {result['verdict']} | MS-SSIM: {result['ms_ssim']:.3f} | edge F1: {result['edge_geometry']['edge_f1']:.3f}")
    print("Report:", out_dir / "report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

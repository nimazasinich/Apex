#!/usr/bin/env python3
"""Capture and geometry-audit APEX Strategy Studio and Backtesting at 1368x753.

This harness uses the project's real CSS against deterministic DOM fixtures. It is
intentionally dependency-light so UI QA still works when npm installation is blocked.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

VIEWPORT = {"width": 1368, "height": 753}


def data_uri(path: Path) -> str:
    mime = "image/svg+xml" if path.suffix.lower() == ".svg" else "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def inline_fixture(project: Path, fixture: Path, page_css: Path) -> str:
    html = fixture.read_text(encoding="utf-8")
    index_css = (project / "src/index.css").read_text(encoding="utf-8")
    scoped_css = page_css.read_text(encoding="utf-8")
    logo_uri = data_uri(project / "public/apex-logo.svg")

    # Remove linked CSS and replace it with the exact current project styles.
    import re
    html = re.sub(r'<link[^>]+rel=["\']stylesheet["\'][^>]*>', '', html, flags=re.I)
    html = html.replace("url('public/apex-logo.svg')", f"url('{logo_uri}')")
    html = html.replace('url("public/apex-logo.svg")', f"url('{logo_uri}')")
    html = html.replace('src="public/apex-logo.svg"', f'src="{logo_uri}"')
    css = (
        "html,body{width:1368px;height:753px;margin:0;overflow:hidden;}\n"
        + index_css
        + "\n"
        + scoped_css
        + "\n"
        + ".apex-logo::before{background-image:url('" + logo_uri + "')!important;}\n"
    )
    style = f"<style id=\"apex-inline-project-css\">{css}</style>"
    if "</head>" in html:
        html = html.replace("</head>", style + "</head>", 1)
    else:
        html = style + html
    return html


def rect(page, selector: str) -> dict[str, float] | None:
    loc = page.locator(selector)
    if loc.count() == 0:
        return None
    return loc.first.bounding_box()


def scroll_metrics(page, selector: str) -> dict[str, Any] | None:
    if page.locator(selector).count() == 0:
        return None
    return page.locator(selector).first.evaluate(
        """el => ({
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          overflowX: getComputedStyle(el).overflowX,
          overflowY: getComputedStyle(el).overflowY,
          rect: (() => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; })()
        })"""
    )


def capture_one(browser, project: Path, name: str, fixture_rel: str, css_rel: str, out_dir: Path) -> dict[str, Any]:
    page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
    html = inline_fixture(project, project / fixture_rel, project / css_rel)
    page.set_content(html, wait_until="domcontentloaded")
    page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
    page.wait_for_timeout(300)

    screenshot = out_dir / f"{name}-1368x753.png"
    page.screenshot(path=str(screenshot), full_page=False)

    body = page.evaluate(
        """() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentScrollHeight: document.documentElement.scrollHeight,
          bodyScrollWidth: document.body.scrollWidth,
          bodyScrollHeight: document.body.scrollHeight
        })"""
    )
    report: dict[str, Any] = {
        "name": name,
        "screenshot": str(screenshot),
        "viewport": VIEWPORT,
        "document": body,
        "pageFits": body["documentScrollWidth"] <= VIEWPORT["width"] and body["documentScrollHeight"] <= VIEWPORT["height"],
    }

    if name == "strategy-studio":
        report["geometry"] = {
            "workspace": rect(page, ".apex-workspace"),
            "sidebar": rect(page, ".apex-sidebar"),
            "topbar": rect(page, ".apex-header"),
            "collections": rect(page, ".strategy-collections-column"),
            "strategyWorkspace": rect(page, ".strategy-main-column"),
            "insights": rect(page, ".strategy-insights-column"),
            "featuredCard": rect(page, ".strategy-main-card"),
            "modelShelf": rect(page, ".strategy-model-shelf"),
            "scoreGuide": rect(page, ".strategy-insight-card.score-guide"),
        }
        report["scroll"] = {
            "studio": scroll_metrics(page, ".strategy-studio"),
            "collections": scroll_metrics(page, ".strategy-collections-column"),
            "workspace": scroll_metrics(page, ".strategy-main-column"),
            "insights": scroll_metrics(page, ".strategy-insights-column"),
        }
    else:
        report["geometry"] = {
            "workspace": rect(page, ".apex-backtest-workspace"),
            "layout": rect(page, ".apex-bt-layout"),
            "setup": rect(page, ".apex-bt-setup"),
            "results": rect(page, ".apex-bt-results"),
            "insights": rect(page, ".apex-bt-insights"),
            "disclaimer": rect(page, ".apex-bt-disclaimer"),
        }
        report["scroll"] = {
            "workspace": scroll_metrics(page, ".apex-backtest-workspace"),
            "layout": scroll_metrics(page, ".apex-bt-layout"),
            "setup": scroll_metrics(page, ".apex-bt-setup"),
            "results": scroll_metrics(page, ".apex-bt-results"),
            "insights": scroll_metrics(page, ".apex-bt-insights"),
        }
        setup = report["scroll"]["setup"]
        insights = report["scroll"]["insights"]
        report["sidePanelsFit"] = bool(
            setup and insights
            and setup["scrollHeight"] <= setup["clientHeight"] + 1
            and insights["scrollHeight"] <= insights["clientHeight"] + 1
        )

    page.close()
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--out", default="qa/screenshots")
    parser.add_argument("--strict", action="store_true", help="Return non-zero when geometry/scroll checks fail")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    out_dir = (project / args.out).resolve() if not Path(args.out).is_absolute() else Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    executable = os.environ.get('APEX_PLAYWRIGHT_EXECUTABLE', '').strip()
    launch_kwargs = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if executable:
        launch_kwargs["executable_path"] = executable

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs)
        reports = [
            capture_one(browser, project, "strategy-studio", "qa/fixtures/strategy_studio_1368.html", "src/pages/strategies/StrategyPage.css", out_dir),
            capture_one(browser, project, "backtesting", "qa/fixtures/backtesting_1368.html", "src/pages/backtesting/BacktestingPage.css", out_dir),
        ]
        browser.close()

    summary = {
        "baseViewport": VIEWPORT,
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "reports": reports,
        "passed": all(r["pageFits"] and (r.get("sidePanelsFit", True)) for r in reports),
    }
    report_path = out_dir / "apex-1368-geometry-report.json"
    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if args.strict and not summary["passed"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
cursor_auto_add_model.py
=========================
اضافه کردن خودکار یک مدل OpenAI-compatible (Base URL سفارشی + API Key) به Cursor IDE.

چرا این روش؟
------------
Cursor هیچ فایل کانفیگ رسمی یا API مستندی برای اضافه کردن مدل/کلید نداره.
کلیدها و مدل‌ها فقط از طریق Settings > Models قابل تنظیمن و داخل یک دیتابیس
SQLite داخلی (state.vscdb) بدون مستندات رسمی ذخیره می‌شن. دستکاری مستقیم اون
فایل می‌تونه دیتابیس رو خراب کنه یا Cursor رو کرش بده. پس این اسکریپت به‌جای
دستکاری فایل، همون کاری رو می‌کنه که خودت با دست انجام می‌دی: باز کردن
Cursor Settings، رفتن به تب Models، و پر کردن فیلدها -- ولی به‌صورت خودکار.

نصب پیش‌نیازها:
    pip install pywinauto pyperclip

نکات مهم قبل از اجرا:
- Cursor باید از قبل روی سیستم نصب باشه و باز باشه (یا مسیر exe رو بدید).
- چون UI کرسر ممکنه بین ورژن‌ها فرق کنه، اگه یک مرحله کنترل موردنظر رو پیدا
  نکرد، اسکریپت متوقف می‌شه، درخت کنترل‌ها رو چاپ می‌کنه و از شما می‌خواد
  خودتون اون مرحله رو دستی انجام بدید و Enter بزنید تا ادامه بده (fail-safe).
"""

import sys
import time
import subprocess

try:
    import pyperclip
    from pywinauto import Desktop
    from pywinauto.application import Application
    from pywinauto.findwindows import ElementNotFoundError
except ImportError:
    print("این پکیج‌ها لازمن: pip install pywinauto pyperclip")
    sys.exit(1)

CURSOR_EXE_HINTS = [
    r"%LOCALAPPDATA%\Programs\cursor\Cursor.exe",
]


def find_or_launch_cursor():
    """پنجره‌ی باز کرسر رو پیدا می‌کنه؛ اگه باز نبود، تلاش می‌کنه اجراش کنه."""
    try:
        wins = Desktop(backend="uia").windows(title_re=".*Cursor.*")
        if wins:
            win = wins[0]
            win.set_focus()
            print(f"[OK] پنجره‌ی کرسر پیدا شد: {win.window_text()}")
            return win
    except Exception:
        pass

    import os
    for hint in CURSOR_EXE_HINTS:
        path = os.path.expandvars(hint)
        if os.path.exists(path):
            print(f"[..] در حال اجرای کرسر از: {path}")
            subprocess.Popen([path])
            time.sleep(6)
            return find_or_launch_cursor()

    print("[!] کرسر پیدا/اجرا نشد. لطفاً خودتون بازش کنید و دوباره اسکریپت رو اجرا کنید.")
    sys.exit(1)


def send_keys_safely(win, keys, delay=0.4):
    win.type_keys(keys, with_spaces=True, pause=0.03)
    time.sleep(delay)


def open_models_settings(win):
    """از طریق Command Palette به تب Settings > Models کرسر می‌ره."""
    win.set_focus()
    send_keys_safely(win, "^+p")          # Ctrl+Shift+P
    send_keys_safely(win, "Cursor Settings", delay=0.6)
    send_keys_safely(win, "{ENTER}", delay=2.0)
    print("[..] پنل Cursor Settings باید باز شده باشه. در حال جستجوی تب Models ...")

    try:
        models_tab = win.child_window(title="Models", control_type="TabItem")
        models_tab.click_input()
        time.sleep(1.0)
        print("[OK] وارد تب Models شدیم.")
        return True
    except (ElementNotFoundError, Exception):
        print("[!] تب Models به‌صورت خودکار پیدا نشد.")
        print_control_tree(win)
        input(">> لطفاً خودتون دستی روی تب 'Models' کلیک کنید و بعد Enter بزنید تا ادامه بدیم... ")
        return False


def print_control_tree(win):
    print("\n----- درخت کنترل‌های پنجره (برای دیباگ) -----")
    try:
        win.print_control_identifiers(depth=4)
    except Exception as e:
        print(f"(نمایش درخت کنترل‌ها ممکن نشد: {e})")
    print("----------------------------------------------\n")


def paste_into_field(win, control_title, value, control_type="Edit"):
    """فیلد رو پیدا می‌کنه، کلیک می‌کنه، پاک می‌کنه و مقدار رو با paste وارد می‌کنه (به‌جای تایپ، برای دقت بیشتر)."""
    try:
        field = win.child_window(title_re=f".*{control_title}.*", control_type=control_type)
        field.click_input()
        send_keys_safely(win, "^a{DELETE}", delay=0.2)
        pyperclip.copy(value)
        send_keys_safely(win, "^v", delay=0.3)
        print(f"[OK] مقدار در فیلد '{control_title}' وارد شد.")
        return True
    except Exception:
        print(f"[!] فیلد '{control_title}' پیدا نشد.")
        pyperclip.copy(value)
        input(f">> مقدار در کلیپ‌بورد کپی شد. لطفاً دستی روی فیلد '{control_title}' کلیک و Ctrl+V کنید، بعد Enter بزنید... ")
        return False


def click_button(win, title):
    try:
        btn = win.child_window(title_re=f".*{title}.*", control_type="Button")
        btn.click_input()
        print(f"[OK] دکمه‌ی '{title}' کلیک شد.")
        return True
    except Exception:
        print(f"[!] دکمه‌ی '{title}' پیدا نشد.")
        input(f">> لطفاً دستی روی دکمه‌ی '{title}' کلیک کنید و بعد Enter بزنید... ")
        return False


def main():
    print("=== افزودن خودکار مدل OpenAI-compatible به Cursor ===\n")
    model_label = input("اسم نمایشی مدل (مثلاً: Gemini-Free یا HF-Router): ").strip()
    base_url = input("Base URL (مثلاً: http://127.0.0.1:8787/v1): ").strip()
    model_id = input("Model ID که سرور شما ازش انتظار داره (مثلاً: gemini-1.5-flash): ").strip()
    api_key = input("API Key (اگه سرورت کلید لازم نداره، هر رشته‌ای بزن، مثلاً 'none'): ").strip()

    win = find_or_launch_cursor()
    open_models_settings(win)

    print("\n[..] در حال کلیک روی 'Add model' ...")
    click_button(win, "Add model")
    time.sleep(0.5)
    paste_into_field(win, "Model Name", model_label)
    send_keys_safely(win, "{ENTER}", delay=0.5)

    print("\n[..] فعال کردن 'Override OpenAI Base URL' ...")
    try:
        toggle = win.child_window(title_re=".*Override OpenAI Base URL.*")
        toggle.click_input()
        time.sleep(0.3)
    except Exception:
        input(">> لطفاً چک‌باکس 'Override OpenAI Base URL' رو دستی فعال کنید و Enter بزنید... ")

    paste_into_field(win, "Base URL", base_url)
    paste_into_field(win, "Model", model_id)
    paste_into_field(win, "API Key", api_key)

    print("\n[..] کلیک روی Verify ...")
    click_button(win, "Verify")

    print("\n=== تمام شد. اگه Verify سبز شد یعنی مدل با موفقیت اضافه شده. ===")
    print("اگه ارور داد: بررسی کن که سرور لوکالت (مثلاً kilo-router.mjs روی 8787) روشن و در دسترس باشه.")


if __name__ == "__main__":
    main()

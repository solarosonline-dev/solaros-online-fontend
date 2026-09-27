#!/usr/bin/env python3
"""
Send WhatsApp Business template messages in bulk, filling in placeholders
from a JSON list of records (e.g. the vendor shortlist JSONs in
.agents/artifacts/).

Uses the official Meta WhatsApp Cloud API (Graph API) — requires an
approved message template, a phone number ID, and an access token.

USAGE
-----
1. Set credentials as environment variables (do NOT hardcode them):
     export WHATSAPP_TOKEN="EAAG..."           # permanent or temp access token
     export WHATSAPP_PHONE_NUMBER_ID="1234567890"

2. Copy whatsapp_template_config.example.json -> whatsapp_template_config.json
   and fill in your approved template name, language code, and the ordered
   list of JSON fields that map to {{1}}, {{2}}, {{3}}... in your template body.

3. Dry run first (no messages sent, just prints what would be sent):
     python3 send_whatsapp_templates.py --input ../delhi_epc_vendors_contactable_next30.json --config whatsapp_template_config.json --dry-run

4. Real send (rate-limited, logs every attempt to a CSV):
     python3 send_whatsapp_templates.py --input ../delhi_epc_vendors_contactable_next30.json --config whatsapp_template_config.json

Notes
-----
- Only sends to records that have a non-empty phone field.
- Phone numbers are normalized: strips spaces/dashes, prepends the
  configured country_code if the number doesn't already start with '+'.
- The first message to a contact who hasn't messaged you must use an
  approved template (free-form text is only allowed within a 24h window
  after they reply) — this is a WhatsApp platform rule, not a script limit.
- Every attempt (success or failure) is appended to the log CSV so you
  don't accidentally double-message someone on a re-run — the script
  skips phone numbers already marked "sent" in the log file.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

GRAPH_API_VERSION = "v20.0"


def normalize_phone(raw: str, country_code: str) -> str:
    digits = re.sub(r"[^\d+]", "", str(raw))
    if digits.startswith("+"):
        return digits
    # strip a leading 0 some local formats use
    digits = digits.lstrip("0")
    return f"{country_code}{digits}"


def load_already_sent(log_file: Path) -> set:
    sent = set()
    if log_file.exists():
        with open(log_file, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("status") == "sent":
                    sent.add(row.get("phone"))
    return sent


def append_log(log_file: Path, row: dict):
    is_new = not log_file.exists()
    with open(log_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp", "phone", "vendor_name", "status", "detail"])
        if is_new:
            writer.writeheader()
        writer.writerow(row)


def build_payload(phone: str, template_name: str, language_code: str, values: list) -> dict:
    return {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(v) if v is not None else ""} for v in values],
                }
            ],
        },
    }


def send_message(phone_number_id: str, token: str, payload: dict) -> tuple:
    """Returns (ok: bool, detail: str)."""
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return True, body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return False, f"HTTP {e.code}: {err_body}"
    except Exception as e:
        return False, str(e)


def main():
    parser = argparse.ArgumentParser(description="Bulk-send WhatsApp template messages from a JSON list.")
    parser.add_argument("--input", required=True, help="Path to JSON array of records")
    parser.add_argument("--config", required=True, help="Path to template config JSON")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be sent, don't call the API")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N records")
    args = parser.parse_args()

    with open(args.config, encoding="utf-8") as f:
        cfg = json.load(f)

    template_name = cfg["template_name"]
    language_code = cfg["language_code"]
    field_mapping = cfg["field_mapping"]
    phone_field = cfg.get("phone_field", "mobile")
    country_code = cfg.get("country_code", "+91")
    rate_limit_seconds = cfg.get("rate_limit_seconds", 2)
    log_file = Path(args.config).parent / cfg.get("log_file", "whatsapp_send_log.csv")

    with open(args.input, encoding="utf-8") as f:
        records = json.load(f)

    if args.limit:
        records = records[: args.limit]

    if not args.dry_run:
        token = os.environ.get("WHATSAPP_TOKEN")
        phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
        if not token or not phone_number_id:
            print("ERROR: set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars first.", file=sys.stderr)
            sys.exit(1)
    else:
        token = phone_number_id = None

    already_sent = load_already_sent(log_file)

    sent_count = skipped_count = failed_count = 0

    for rec in records:
        raw_phone = rec.get(phone_field)
        vendor_name = rec.get("vendor_name") or rec.get("vendor") or "unknown"

        if not raw_phone:
            print(f"SKIP (no phone): {vendor_name}")
            skipped_count += 1
            continue

        phone = normalize_phone(raw_phone, country_code)

        if phone in already_sent:
            print(f"SKIP (already sent): {vendor_name} ({phone})")
            skipped_count += 1
            continue

        values = [rec.get(field) for field in field_mapping]
        payload = build_payload(phone, template_name, language_code, values)

        if args.dry_run:
            print(f"[DRY RUN] Would send to {phone} ({vendor_name}): {values}")
            continue

        ok, detail = send_message(phone_number_id, token, payload)
        status = "sent" if ok else "failed"
        append_log(
            log_file,
            {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "phone": phone,
                "vendor_name": vendor_name,
                "status": status,
                "detail": detail[:300],
            },
        )

        if ok:
            print(f"SENT to {phone} ({vendor_name})")
            sent_count += 1
        else:
            print(f"FAILED to {phone} ({vendor_name}): {detail}")
            failed_count += 1

        time.sleep(rate_limit_seconds)

    if not args.dry_run:
        print(f"\nDone. sent={sent_count} failed={failed_count} skipped={skipped_count}")
        print(f"Log written to: {log_file}")


if __name__ == "__main__":
    main()

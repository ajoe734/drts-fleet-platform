"""Independent PDF/CSV parsing; install pypdf in an external verification venv."""
import csv
import json
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(sys.argv[1])
manifest = json.loads((root / "filtered.json").read_text())
rows = manifest[0]["rows"]
assert all(item["rows"] == rows for item in manifest)


def cell(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return str(value)


with (root / "filtered.csv").open(newline="") as handle:
    actual = list(csv.DictReader(handle))
assert actual == [{key: cell(value) for key, value in row.items()} for row in rows]


def verify_pdf(name, expected):
    reader = PdfReader(root / name, strict=True)
    text = "\n".join(page.extract_text() for page in reader.pages)
    normalized = "".join(text.split())
    for row in expected:
        for key, value in row.items():
            assert "".join(f"{key}: {cell(value)}".split()) in normalized, (name, key, value)
    print(f"{name}: parsed {len(reader.pages)} pages; verified {len(expected)} records")


verify_pdf("filtered.pdf", rows)
verify_pdf("wide.pdf", json.loads((root / "wide.json").read_text()))
assert "No data." in PdfReader(root / "empty.pdf", strict=True).pages[0].extract_text()
if (root / "unicode.pdf").exists():
    verify_pdf("unicode.pdf", [{"name": "台北車隊", "note": "長文字測試"}])
print(json.dumps(manifest, ensure_ascii=False))

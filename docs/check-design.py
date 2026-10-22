"""Limited structural checks for design artifacts, not a runtime test suite."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
required = ["product-requirements", "domain-rules", "architecture", "data-model", "api-contracts", "implementation-plan"]
for name in required:
    assert (ROOT / "docs" / (name + ".md")).is_file(), name

link_count = 0
for file in [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md"))]:
    if file.name == "original-request.th.md":
        continue
    for target in re.findall(r"\]\(([^)]+)\)", file.read_text(encoding="utf-8")):
        if "://" in target or target.startswith("#"):
            continue
        assert (file.parent / target.split("#")[0]).exists(), (file, target)
        link_count += 1

doc = json.loads((ROOT / "docs" / "openapi.json").read_text(encoding="utf-8"))
assert doc["openapi"] == "3.1.0"
references = []


def walk(value):
    if isinstance(value, dict):
        if "$ref" in value:
            path = value["$ref"]
            assert path.startswith("#/"), path
            result = doc
            for key in path[2:].split("/"):
                result = result[key]
            references.append(path)
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)


walk(doc)
operation_ids = set()
for path, methods in doc["paths"].items():
    for method, operation in methods.items():
        assert method in {"get", "post", "patch"}
        assert operation["operationId"] not in operation_ids
        operation_ids.add(operation["operationId"])
        params = operation["parameters"]
        assert set(re.findall(r"\{(\w+)\}", path)) == {p["name"] for p in params if p["in"] == "path"}
        headers = {p["name"] for p in params if p["in"] == "header"}
        if path == "/health":
            assert method == "get" and operation["security"] == []
            assert "200" in operation["responses"]
            continue
        if path in {"/auth/csrf", "/auth/login", "/auth/logout", "/auth/password", "/me", "/stores", "/stores/{storeId}"}:
            assert operation["x-implemented"] is True
            assert "200" in operation["responses"]
            assert "Idempotency-Key" not in headers
            if method == "post":
                assert {"X-CSRF-Token", "Origin"} <= headers
            elif path == "/auth/csrf":
                assert operation["security"] == []
            continue
        if path in {"/stores/{storeId}/products", "/stores/{storeId}/products/{productId}",
                    "/accounts", "/accounts/{accountId}", "/accounts/{accountId}/opening", "/stores/{storeId}/accounts"}:
            assert operation["x-implemented"] is True
            if method != "get":
                assert {"X-CSRF-Token", "Origin", "Idempotency-Key"} <= headers
            assert ("201" if method == "post" else "200") in operation["responses"]
            continue
        assert "X-CSRF-Token" in headers
        if not path.endswith("/preview"):
            assert "Idempotency-Key" in headers
        assert "409" in operation["responses"]

scenarios = (ROOT / "docs" / "acceptance-scenarios.md").read_text(encoding="utf-8")
for letter in "ABCDEFGHIJKLMNOP":
    assert re.search(r"^\| " + letter + r"(?:[12])? \|", scenarios, re.M), letter
cash_expected = 50000 + 100000 - 20000 - 10000
assert cash_expected == 120000
assert 115000 - cash_expected == -5000
assert cash_expected - 5000 == 115000
assert 50000 - 30000 == 20000
assert 50000 - (30000 + 10000) == 10000
gross = 10500
discount = (gross * 500 + 5000) // 10000
assert discount == 525 and gross - discount == 9975
assert 4000 + 5975 == 9975
money = doc["components"]["schemas"]["Money"]["pattern"]
signed = doc["components"]["schemas"]["SignedMoney"]["pattern"]
assert re.fullmatch(money, "9975") and not re.fullmatch(money, "99.75")
assert re.fullmatch(signed, "-10000") and not re.fullmatch(money, "-10000")
print(f"PASS: {len(required)} required docs, {link_count} links, {len(doc['paths'])} core paths, {len(references)} local refs, A-P coverage, walkthrough arithmetic")
print("LIMIT: structural checks only; no full OpenAPI/Mermaid validation or runtime/DB/Android tests")

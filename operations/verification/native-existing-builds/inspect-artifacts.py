#!/usr/bin/env python3
"""Read-only cryptographic and manifest inspector for existing EAS Android APK and iOS IPA builds.

Uses only Python 3 standard library modules plus the system OpenSSL CLI so that hosted
runners and local unit tests require zero external pip packages or network downloads.
Never records private keys, raw download URLs, device UDIDs, or embedded provider API keys.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import plistlib
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import zipfile
from typing import Any


ANDROID_ATTR_RESOURCE_IDS: dict[int, str] = {
    0x01010001: "label",
    0x01010002: "icon",
    0x01010003: "name",
    0x0101000F: "protectionLevel",
    0x0101001E: "scheme",
    0x0101020C: "minSdkVersion",
    0x0101021B: "versionCode",
    0x0101021C: "versionName",
    0x01010270: "targetSdkVersion",
    0x01010280: "allowBackup",
    0x010103AF: "supportsRtl",
    0x010104E0: "exported",
    0x01010572: "compileSdkVersion",
    0x01010573: "compileSdkVersionCodename",
}

APK_SIG_BLOCK_MAGIC = b"APK Sig Block 42"
APK_SIG_SCHEME_V2_ID = 0x7109871A

# Signature algorithm IDs in APK Signature Scheme v2:
# value -> (digest_name, openssl_dgst_flag, pss_salt_len_or_none)
APK_V2_ALGORITHMS: dict[int, tuple[str, str, int | None]] = {
    0x0101: ("sha256", "-sha256", 32),  # RSA-PSS with SHA2-256
    0x0102: ("sha512", "-sha512", 64),  # RSA-PSS with SHA2-512
    0x0103: ("sha256", "-sha256", None),  # RSA PKCS#1 v1.5 with SHA2-256
    0x0104: ("sha512", "-sha512", None),  # RSA PKCS#1 v1.5 with SHA2-512
    0x0201: ("sha256", "-sha256", None),  # ECDSA with SHA2-256
    0x0202: ("sha512", "-sha512", None),  # ECDSA with SHA2-512
    0x0301: ("sha256", "-sha256", None),  # DSA with SHA2-256
}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_checked(cmd: list[str], timeout_sec: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )


def parse_pem_certificates(pem_bytes: bytes, temp_dir: pathlib.Path) -> list[dict[str, str]]:
    text = pem_bytes.decode("utf-8", errors="replace")
    marker_begin = "-----BEGIN CERTIFICATE-----"
    marker_end = "-----END CERTIFICATE-----"
    certs: list[dict[str, str]] = []
    pos = 0
    idx = 0
    while True:
        start = text.find(marker_begin, pos)
        if start == -1:
            break
        end = text.find(marker_end, start)
        if end == -1:
            break
        end += len(marker_end)
        block = text[start:end] + "\n"
        pos = end
        cert_pem_path = temp_dir / f"cert-{idx}.pem"
        cert_der_path = temp_dir / f"cert-{idx}.der"
        idx += 1
        cert_pem_path.write_text(block, encoding="utf-8")
        der_proc = run_checked(
            ["openssl", "x509", "-in", str(cert_pem_path), "-outform", "DER", "-out", str(cert_der_path)]
        )
        if der_proc.returncode != 0 or not cert_der_path.is_file():
            raise ValueError("Failed to convert signer certificate to DER")
        der_bytes = cert_der_path.read_bytes()
        meta_proc = run_checked(
            [
                "openssl",
                "x509",
                "-in",
                str(cert_pem_path),
                "-noout",
                "-subject",
                "-issuer",
                "-enddate",
                "-nameopt",
                "RFC2253",
            ]
        )
        if meta_proc.returncode != 0:
            raise ValueError("Failed to read X.509 certificate metadata")
        subject = ""
        issuer = ""
        not_valid_after = ""
        for line in meta_proc.stdout.splitlines():
            if line.startswith("subject="):
                subject = line[len("subject=") :].strip()
            elif line.startswith("issuer="):
                issuer = line[len("issuer=") :].strip()
            elif line.startswith("notAfter="):
                not_valid_after = line[len("notAfter=") :].strip()
        certs.append(
            {
                "subject": subject,
                "issuer": issuer,
                "sha256": sha256_hex(der_bytes),
                "not_valid_after": not_valid_after,
            }
        )
    return certs


def parse_der_certificate(der_bytes: bytes, temp_dir: pathlib.Path, label: str) -> tuple[dict[str, str], bytes]:
    der_path = temp_dir / f"{label}.der"
    pubkey_der_path = temp_dir / f"{label}.pub.der"
    der_path.write_bytes(der_bytes)
    meta_proc = run_checked(
        [
            "openssl",
            "x509",
            "-inform",
            "DER",
            "-in",
            str(der_path),
            "-noout",
            "-subject",
            "-issuer",
            "-enddate",
            "-nameopt",
            "RFC2253",
        ]
    )
    if meta_proc.returncode != 0:
        raise ValueError("Invalid DER certificate in APK signing block")
    pub_proc = run_checked(
        [
            "openssl",
            "x509",
            "-inform",
            "DER",
            "-in",
            str(der_path),
            "-pubkey",
            "-noout",
        ]
    )
    if pub_proc.returncode != 0:
        raise ValueError("Unable to extract public key from DER certificate")
    pub_pem_path = temp_dir / f"{label}.pub.pem"
    pub_pem_path.write_text(pub_proc.stdout, encoding="utf-8")
    pub_der_proc = run_checked(
        [
            "openssl",
            "pkey",
            "-pubin",
            "-in",
            str(pub_pem_path),
            "-outform",
            "DER",
            "-out",
            str(pubkey_der_path),
        ]
    )
    if pub_der_proc.returncode != 0 or not pubkey_der_path.is_file():
        raise ValueError("Unable to convert certificate public key to DER")
    subject = ""
    issuer = ""
    not_valid_after = ""
    for line in meta_proc.stdout.splitlines():
        if line.startswith("subject="):
            subject = line[len("subject=") :].strip()
        elif line.startswith("issuer="):
            issuer = line[len("issuer=") :].strip()
        elif line.startswith("notAfter="):
            not_valid_after = line[len("notAfter=") :].strip()
    return (
        {
            "subject": subject,
            "issuer": issuer,
            "sha256": sha256_hex(der_bytes),
            "not_valid_after": not_valid_after,
        },
        pubkey_der_path.read_bytes(),
    )


def verify_cms_signature(
    cms_der_path: pathlib.Path,
    output_path: pathlib.Path,
    temp_dir: pathlib.Path,
    content_path: pathlib.Path | None = None,
) -> dict[str, Any]:
    signer_pem_path = pathlib.Path(f"{cms_der_path}.signers.pem")
    cmd = [
        "openssl",
        "cms",
        "-verify",
        "-inform",
        "DER",
        "-in",
        str(cms_der_path),
        "-noverify",
        "-binary",
        "-out",
        str(output_path),
        "-signer",
        str(signer_pem_path),
    ]
    if content_path is not None:
        cmd.extend(["-content", str(content_path)])
    proc = run_checked(cmd, timeout_sec=20)
    if proc.returncode != 0 or not signer_pem_path.is_file():
        raise ValueError(f"CMS signature verification failed (exit {proc.returncode})")
    verified_signers = parse_pem_certificates(signer_pem_path.read_bytes(), temp_dir)
    if not verified_signers:
        raise ValueError("CMS verification produced no signer certificates")
    return {
        "exit_code": proc.returncode,
        "cms_verified": True,
        "trust_chain_verified": False,
        "verified_signer_certificates": verified_signers,
    }


def _read_length_prefixed_slice(buf: bytes, offset: int) -> tuple[bytes, int]:
    if offset + 4 > len(buf):
        raise ValueError("Truncated length-prefixed slice in APK signing block")
    length = struct.unpack_from("<I", buf, offset)[0]
    start = offset + 4
    end = start + length
    if end > len(buf):
        raise ValueError("Length-prefixed slice exceeds parent buffer in APK signing block")
    return buf[start:end], end


def _iter_length_prefixed(buf: bytes) -> list[bytes]:
    items: list[bytes] = []
    offset = 0
    while offset < len(buf):
        item, offset = _read_length_prefixed_slice(buf, offset)
        items.append(item)
    return items


def _find_zip_eocd(apk_bytes: bytes) -> tuple[int, int, int]:
    max_comment = min(len(apk_bytes), 65535 + 22)
    search_start = len(apk_bytes) - max_comment
    for pos in range(len(apk_bytes) - 22, search_start - 1, -1):
        if apk_bytes[pos : pos + 4] == b"PK\x05\x06":
            comment_len = struct.unpack_from("<H", apk_bytes, pos + 20)[0]
            if pos + 22 + comment_len == len(apk_bytes):
                cd_size, cd_offset = struct.unpack_from("<II", apk_bytes, pos + 12)
                return pos, cd_offset, cd_size
    raise ValueError("ZIP End of Central Directory not found in APK")


def _compute_apk_v2_digests(
    apk_bytes: bytes,
    sig_block_start: int,
    cd_offset: int,
    eocd_offset: int,
    algos: set[str],
) -> dict[str, bytes]:
    eocd_modified = bytearray(apk_bytes[eocd_offset:])
    struct.pack_into("<I", eocd_modified, 16, sig_block_start)
    sections = [
        apk_bytes[:sig_block_start],
        apk_bytes[cd_offset:eocd_offset],
        bytes(eocd_modified),
    ]
    chunk_size = 1048576  # 1 MiB
    chunk_digests: dict[str, list[bytes]] = {algo: [] for algo in algos}
    total_chunks = 0
    for section in sections:
        pos = 0
        while pos < len(section):
            chunk = section[pos : pos + chunk_size]
            pos += len(chunk)
            total_chunks += 1
            prefix = b"\xa5" + struct.pack("<I", len(chunk))
            for algo in algos:
                h = hashlib.new(algo)
                h.update(prefix)
                h.update(chunk)
                chunk_digests[algo].append(h.digest())
    final_digests: dict[str, bytes] = {}
    for algo, digests in chunk_digests.items():
        h = hashlib.new(algo)
        h.update(b"\x5a" + struct.pack("<I", total_chunks))
        for d in digests:
            h.update(d)
        final_digests[algo] = h.digest()
    return final_digests


def verify_apk_v2_signatures(apk_bytes: bytes, temp_dir: pathlib.Path) -> list[dict[str, Any]]:
    eocd_offset, cd_offset, _cd_size = _find_zip_eocd(apk_bytes)
    if cd_offset < 32 or apk_bytes[cd_offset - 16 : cd_offset] != APK_SIG_BLOCK_MAGIC:
        raise ValueError("APK Signing Block magic not found before Central Directory")
    block_size_footer = struct.unpack_from("<Q", apk_bytes, cd_offset - 24)[0]
    sig_block_start = cd_offset - 8 - block_size_footer
    if sig_block_start < 0:
        raise ValueError("Invalid APK Signing Block offset")
    block_size_header = struct.unpack_from("<Q", apk_bytes, sig_block_start)[0]
    if block_size_header != block_size_footer:
        raise ValueError("APK Signing Block header and footer sizes do not match")

    pairs_buf = apk_bytes[sig_block_start + 8 : cd_offset - 24]
    v2_block: bytes | None = None
    offset = 0
    while offset < len(pairs_buf):
        if offset + 12 > len(pairs_buf):
            raise ValueError("Truncated pair in APK Signing Block")
        pair_len = struct.unpack_from("<Q", pairs_buf, offset)[0]
        if pair_len < 4 or offset + 8 + pair_len > len(pairs_buf):
            raise ValueError("Invalid pair length in APK Signing Block")
        pair_id = struct.unpack_from("<I", pairs_buf, offset + 8)[0]
        pair_val = pairs_buf[offset + 12 : offset + 8 + pair_len]
        offset += 8 + pair_len
        if pair_id == APK_SIG_SCHEME_V2_ID:
            v2_block = pair_val
            break

    if v2_block is None:
        raise ValueError("APK Signature Scheme v2 block (0x7109871a) not present")

    signers_slice, _ = _read_length_prefixed_slice(v2_block, 0)
    signer_blobs = _iter_length_prefixed(signers_slice)
    if not signer_blobs:
        raise ValueError("APK Signature Scheme v2 contains zero signers")

    # Collect required digest algorithms across all signers
    needed_hash_algos: set[str] = set()
    parsed_signers: list[tuple[bytes, list[tuple[int, bytes]], list[bytes], list[tuple[int, bytes]], bytes]] = []

    for signer_blob in signer_blobs:
        signed_data, off1 = _read_length_prefixed_slice(signer_blob, 0)
        signatures_slice, off2 = _read_length_prefixed_slice(signer_blob, off1)
        public_key_der, _ = _read_length_prefixed_slice(signer_blob, off2)

        digests_slice, sd_off1 = _read_length_prefixed_slice(signed_data, 0)
        certs_slice, _ = _read_length_prefixed_slice(signed_data, sd_off1)

        digests: list[tuple[int, bytes]] = []
        for d_entry in _iter_length_prefixed(digests_slice):
            algo_id = struct.unpack_from("<I", d_entry, 0)[0]
            digest_bytes, _ = _read_length_prefixed_slice(d_entry, 4)
            digests.append((algo_id, digest_bytes))
            if algo_id in APK_V2_ALGORITHMS:
                needed_hash_algos.add(APK_V2_ALGORITHMS[algo_id][0])

        cert_ders = _iter_length_prefixed(certs_slice)
        signatures: list[tuple[int, bytes]] = []
        for s_entry in _iter_length_prefixed(signatures_slice):
            algo_id = struct.unpack_from("<I", s_entry, 0)[0]
            sig_bytes, _ = _read_length_prefixed_slice(s_entry, 4)
            signatures.append((algo_id, sig_bytes))

        parsed_signers.append((signed_data, digests, cert_ders, signatures, public_key_der))

    if not needed_hash_algos:
        raise ValueError("No supported APK Signature Scheme v2 digest algorithm found")

    computed_digests = _compute_apk_v2_digests(
        apk_bytes, sig_block_start, cd_offset, eocd_offset, needed_hash_algos
    )

    verified_signers_out: list[dict[str, Any]] = []
    for idx, (signed_data, digests, cert_ders, signatures, public_key_der) in enumerate(parsed_signers):
        if not cert_ders or not signatures or not digests:
            raise ValueError(f"Incomplete APK v2 signer record at index {idx}")

        cert_infos: list[dict[str, str]] = []
        first_cert_pubkey_der: bytes | None = None
        for c_idx, cert_der in enumerate(cert_ders):
            c_info, c_pub_der = parse_der_certificate(cert_der, temp_dir, f"apk-signer-{idx}-cert-{c_idx}")
            cert_infos.append(c_info)
            if c_idx == 0:
                first_cert_pubkey_der = c_pub_der

        if first_cert_pubkey_der != public_key_der:
            raise ValueError(f"APK v2 signer {idx} public key does not match leaf certificate")

        # Write public key PEM for openssl dgst -verify
        pub_der_path = temp_dir / f"apk-signer-{idx}.pub.der"
        pub_pem_path = temp_dir / f"apk-signer-{idx}.pub.pem"
        pub_der_path.write_bytes(public_key_der)
        pub_conv = run_checked(
            ["openssl", "pkey", "-pubin", "-inform", "DER", "-in", str(pub_der_path), "-out", str(pub_pem_path)]
        )
        if pub_conv.returncode != 0:
            raise ValueError(f"Failed to convert APK v2 signer {idx} public key to PEM")

        signed_data_path = temp_dir / f"apk-signer-{idx}-signed-data.bin"
        signed_data_path.write_bytes(signed_data)

        digest_by_algo: dict[int, bytes] = {algo_id: d_bytes for algo_id, d_bytes in digests}
        algo_ids_out: list[str] = []
        for s_idx, (algo_id, sig_bytes) in enumerate(signatures):
            if algo_id not in APK_V2_ALGORITHMS:
                raise ValueError(f"Unsupported APK v2 signature algorithm: {hex(algo_id)}")
            if algo_id not in digest_by_algo:
                raise ValueError(f"APK v2 signature algorithm {hex(algo_id)} has no matching content digest")
            hash_name, dgst_flag, pss_salt = APK_V2_ALGORITHMS[algo_id]
            if digest_by_algo[algo_id] != computed_digests[hash_name]:
                raise ValueError(f"APK v2 content digest mismatch for algorithm {hex(algo_id)}")

            sig_path = temp_dir / f"apk-signer-{idx}-sig-{s_idx}.bin"
            sig_path.write_bytes(sig_bytes)
            cmd = ["openssl", "dgst", dgst_flag, "-verify", str(pub_pem_path), "-signature", str(sig_path)]
            if pss_salt is not None:
                cmd.extend(["-sigopt", "rsa_padding_mode:pss", "-sigopt", f"rsa_pss_saltlen:{pss_salt}"])
            cmd.append(str(signed_data_path))
            v_proc = run_checked(cmd)
            if v_proc.returncode != 0:
                raise ValueError(f"APK v2 cryptographic signature verification failed for {hex(algo_id)}")
            algo_ids_out.append(hex(algo_id))

        verified_signers_out.append(
            {
                "certificates": cert_infos,
                "signature_algorithm_ids": algo_ids_out,
                "content_digest_verified": True,
                "public_key_matches_certificate": True,
            }
        )

    return [
        {
            "version": 2,
            "verified": True,
            "signers": verified_signers_out,
        }
    ]


def _decode_axml_string_pool(data: bytes, offset: int, header_size: int, _chunk_size: int) -> list[str]:
    string_count, _style_count, flags, strings_start, _styles_start = struct.unpack_from(
        "<IIIII", data, offset + 8
    )
    is_utf8 = bool(flags & (1 << 8))
    offsets_base = offset + header_size
    pool_base = offset + strings_start
    strings: list[str] = []
    for i in range(string_count):
        str_rel = struct.unpack_from("<I", data, offsets_base + i * 4)[0]
        pos = pool_base + str_rel
        if is_utf8:
            # Skip UTF-16 length varint (1 or 2 bytes)
            b0 = data[pos]
            pos += 2 if (b0 & 0x80) else 1
            # Read UTF-8 byte length varint (1 or 2 bytes)
            b0 = data[pos]
            if b0 & 0x80:
                byte_len = ((b0 & 0x7F) << 8) | data[pos + 1]
                pos += 2
            else:
                byte_len = b0
                pos += 1
            strings.append(data[pos : pos + byte_len].decode("utf-8", errors="replace"))
        else:
            w0 = struct.unpack_from("<H", data, pos)[0]
            if w0 & 0x8000:
                char_len = ((w0 & 0x7FFF) << 16) | struct.unpack_from("<H", data, pos + 2)[0]
                pos += 4
            else:
                char_len = w0
                pos += 2
            strings.append(data[pos : pos + char_len * 2].decode("utf-16le", errors="replace"))
    return strings


def parse_android_binary_manifest(data: bytes) -> dict[str, Any]:
    if len(data) < 8:
        raise ValueError("AndroidManifest.xml is too short")
    xml_type, header_size, total_size = struct.unpack_from("<HHI", data, 0)
    if xml_type != 0x0003 or total_size > len(data):
        raise ValueError("AndroidManifest.xml is not a valid Android binary XML resource")

    strings: list[str] = []
    resource_ids: list[int] = []
    manifest_attrs: dict[str, Any] = {}
    uses_sdk: dict[str, Any] = {}
    uses_permissions: list[str] = []
    declared_permissions: list[str] = []
    application_attrs: dict[str, Any] = {}
    activity_names: list[str] = []
    service_names: list[str] = []
    deep_link_schemes: set[str] = set()
    element_stack: list[str] = []

    offset = header_size
    while offset + 8 <= len(data):
        chunk_type, chunk_header_size, chunk_size = struct.unpack_from("<HHI", data, offset)
        if chunk_size < 8 or offset + chunk_size > len(data):
            raise ValueError("Malformed chunk in AndroidManifest.xml")

        if chunk_type == 0x0001:  # RES_STRING_POOL_TYPE
            strings = _decode_axml_string_pool(data, offset, chunk_header_size, chunk_size)
        elif chunk_type == 0x0180:  # RES_XML_RESOURCE_MAP_TYPE
            count = (chunk_size - chunk_header_size) // 4
            resource_ids = [
                struct.unpack_from("<I", data, offset + chunk_header_size + i * 4)[0]
                for i in range(count)
            ]
        elif chunk_type == 0x0102:  # RES_XML_START_ELEMENT_TYPE
            _ns_idx, name_idx = struct.unpack_from("<ii", data, offset + 16)
            attr_start, attr_size, attr_count = struct.unpack_from("<HHH", data, offset + 24)
            elem_name = strings[name_idx] if 0 <= name_idx < len(strings) else ""
            element_stack.append(elem_name)

            attrs: dict[str, Any] = {}
            attr_base = offset + 16 + attr_start
            for i in range(attr_count):
                a_off = attr_base + i * attr_size
                _a_ns, a_name_idx, a_raw_val, _tv_size, _zero, a_type, a_data = struct.unpack_from(
                    "<iiiHBBI", data, a_off
                )
                attr_name = ""
                if 0 <= a_name_idx < len(strings) and strings[a_name_idx]:
                    attr_name = strings[a_name_idx]
                elif 0 <= a_name_idx < len(resource_ids):
                    attr_name = ANDROID_ATTR_RESOURCE_IDS.get(resource_ids[a_name_idx], f"attr_{a_name_idx}")

                if a_type == 0x03 and 0 <= a_data < len(strings):  # TYPE_STRING
                    val: Any = strings[a_data]
                elif 0 <= a_raw_val < len(strings):
                    val = strings[a_raw_val]
                elif a_type in (0x10, 0x11):  # TYPE_INT_DEC / TYPE_INT_HEX
                    val = str(a_data)
                elif a_type == 0x12:  # TYPE_INT_BOOLEAN
                    val = "true" if a_data != 0 else "false"
                elif a_type == 0x01:  # TYPE_REFERENCE
                    val = f"@{a_data:08X}"
                else:
                    val = str(a_data)
                if attr_name:
                    attrs[attr_name] = val

            if elem_name == "manifest":
                for k in ("package", "versionCode", "versionName", "compileSdkVersion", "compileSdkVersionCodename"):
                    if k in attrs:
                        manifest_attrs[k] = attrs[k]
            elif elem_name == "uses-sdk":
                for k in ("minSdkVersion", "targetSdkVersion"):
                    if k in attrs:
                        uses_sdk[k] = attrs[k]
            elif elem_name in ("uses-permission", "uses-permission-sdk-23"):
                perm_name = attrs.get("name")
                if isinstance(perm_name, str) and perm_name and perm_name not in uses_permissions:
                    uses_permissions.append(perm_name)
            elif elem_name == "permission":
                perm_name = attrs.get("name")
                if isinstance(perm_name, str) and perm_name and perm_name not in declared_permissions:
                    declared_permissions.append(perm_name)
            elif elem_name == "application":
                # Explicitly omit <meta-data> children so embedded API keys are never recorded.
                for k in ("name", "allowBackup", "supportsRtl"):
                    if k in attrs:
                        application_attrs[k] = attrs[k]
            elif elem_name == "activity":
                act_name = attrs.get("name")
                if isinstance(act_name, str) and act_name:
                    activity_names.append(act_name)
            elif elem_name == "service":
                svc_name = attrs.get("name")
                if isinstance(svc_name, str) and svc_name:
                    service_names.append(svc_name)
            elif elem_name == "data" and "activity" in element_stack and "intent-filter" in element_stack:
                scheme = attrs.get("scheme")
                if isinstance(scheme, str) and scheme:
                    deep_link_schemes.add(scheme)
        elif chunk_type == 0x0103:  # RES_XML_END_ELEMENT_TYPE
            if element_stack:
                element_stack.pop()

        offset += chunk_size

    if not manifest_attrs.get("package"):
        raise ValueError("AndroidManifest.xml did not contain a valid package attribute")

    return {
        "package": manifest_attrs.get("package"),
        "version_code": str(manifest_attrs.get("versionCode", "")),
        "version_name": str(manifest_attrs.get("versionName", "")),
        "compile_sdk_version": str(manifest_attrs.get("compileSdkVersion", "")),
        "uses_sdk": uses_sdk,
        "uses_permissions": uses_permissions,
        "declared_permissions": declared_permissions,
        "application": application_attrs,
        "activity_names": activity_names,
        "service_names": service_names,
        "deep_link_schemes": sorted(deep_link_schemes),
    }


def sanitize_embedded_expo_config(raw_config: dict[str, Any]) -> dict[str, Any]:
    extra = raw_config.get("extra") if isinstance(raw_config.get("extra"), dict) else {}
    eas = extra.get("eas") if isinstance(extra.get("eas"), dict) else {}
    raw_api_url = extra.get("apiBaseUrl")
    api_host: str | None = None
    api_sha256: str | None = None
    if isinstance(raw_api_url, str) and raw_api_url:
        parsed = urllib.parse.urlparse(raw_api_url)
        api_host = parsed.hostname
        api_sha256 = sha256_hex(raw_api_url.encode("utf-8"))

    ios_cfg = raw_config.get("ios") if isinstance(raw_config.get("ios"), dict) else {}
    android_cfg = raw_config.get("android") if isinstance(raw_config.get("android"), dict) else {}

    return {
        "name": raw_config.get("name"),
        "slug": raw_config.get("slug"),
        "version": raw_config.get("version"),
        "scheme": raw_config.get("scheme"),
        "eas_project_id": eas.get("projectId"),
        "packaged_api_base_url_host": api_host,
        "packaged_api_base_url_sha256": api_sha256,
        "ios_bundle_identifier": ios_cfg.get("bundleIdentifier"),
        "ios_build_number": str(ios_cfg.get("buildNumber")) if ios_cfg.get("buildNumber") is not None else None,
        "android_package": android_cfg.get("package"),
        "android_version_code": (
            str(android_cfg.get("versionCode")) if android_cfg.get("versionCode") is not None else None
        ),
    }


def inspect_android(apk_path: pathlib.Path) -> dict[str, Any]:
    apk_bytes = apk_path.read_bytes()
    file_sha256 = sha256_hex(apk_bytes)
    file_size = len(apk_bytes)

    with tempfile.TemporaryDirectory(prefix="driver-apk-inspect-") as tmp:
        temp_dir = pathlib.Path(tmp)
        signature_schemes = verify_apk_v2_signatures(apk_bytes, temp_dir)

    with zipfile.ZipFile(apk_path, "r") as zf:
        names = set(zf.namelist())
        if "AndroidManifest.xml" not in names:
            raise ValueError("APK is missing AndroidManifest.xml")
        if "classes.dex" not in names:
            raise ValueError("APK is missing classes.dex")
        manifest_raw = zf.read("AndroidManifest.xml")
        manifest_info = parse_android_binary_manifest(manifest_raw)
        embedded_expo: dict[str, Any] | None = None
        if "assets/app.config" in names:
            cfg_obj = json.loads(zf.read("assets/app.config").decode("utf-8"))
            if isinstance(cfg_obj, dict):
                embedded_expo = sanitize_embedded_expo_config(cfg_obj)

    return {
        "platform": "ANDROID",
        "archive_format": "apk",
        "size_bytes": file_size,
        "sha256": file_sha256,
        "manifest_sha256": sha256_hex(manifest_raw),
        "app_identifier": manifest_info["package"],
        "app_version": manifest_info["version_name"],
        "app_build_version": manifest_info["version_code"],
        "manifest": manifest_info,
        "signature_schemes": signature_schemes,
        "signature_verified": all(s.get("verified") is True for s in signature_schemes),
        "embedded_expo_config": embedded_expo,
        "verification_scope": (
            "APK Signature Scheme v2 1 MiB chunk digests, signed_data cryptographic signature, "
            "and X.509 leaf certificate public-key binding verified; binary AndroidManifest.xml "
            "and embedded Expo app.config parsed. No physical device installation or launch performed."
        ),
    }


def _extract_macho_slice(macho_bytes: bytes) -> bytes:
    if len(macho_bytes) < 32:
        raise ValueError("Mach-O executable is too small")
    magic_be = struct.unpack_from(">I", macho_bytes, 0)[0]
    if magic_be == 0xCAFEBABE:  # Fat binary
        nfat_arch = struct.unpack_from(">I", macho_bytes, 4)[0]
        if nfat_arch < 1 or len(macho_bytes) < 8 + nfat_arch * 20:
            raise ValueError("Invalid fat Mach-O header")
        offset, size = struct.unpack_from(">II", macho_bytes, 16)
        return macho_bytes[offset : offset + size]
    return macho_bytes


def inspect_ios(ipa_path: pathlib.Path) -> dict[str, Any]:
    ipa_bytes = ipa_path.read_bytes()
    file_sha256 = sha256_hex(ipa_bytes)
    file_size = len(ipa_bytes)

    with tempfile.TemporaryDirectory(prefix="driver-ipa-inspect-") as tmp:
        temp_dir = pathlib.Path(tmp)
        with zipfile.ZipFile(ipa_path, "r") as zf:
            namelist = zf.namelist()
            info_candidates = [
                n
                for n in namelist
                if n.startswith("Payload/") and n.count("/") == 2 and n.endswith(".app/Info.plist")
            ]
            if len(info_candidates) != 1:
                raise ValueError("IPA must contain exactly one Payload/<App>.app/Info.plist")
            prefix = info_candidates[0][: -len("Info.plist")]

            raw_info = zf.read(prefix + "Info.plist")
            info = plistlib.loads(raw_info)
            if not isinstance(info, dict):
                raise ValueError("Info.plist did not decode to a dictionary")

            allowed_info_keys = [
                "CFBundleIdentifier",
                "CFBundleDisplayName",
                "CFBundleName",
                "CFBundleShortVersionString",
                "CFBundleVersion",
                "CFBundleSupportedPlatforms",
                "DTPlatformName",
                "MinimumOSVersion",
                "UIBackgroundModes",
                "CFBundleURLTypes",
            ]
            info_plist_filtered = {k: info[k] for k in allowed_info_keys if k in info}
            bundle_id = info.get("CFBundleIdentifier")
            executable_name = info.get("CFBundleExecutable")
            if not isinstance(bundle_id, str) or not bundle_id:
                raise ValueError("Info.plist missing CFBundleIdentifier")
            if not isinstance(executable_name, str) or not executable_name:
                raise ValueError("Info.plist missing CFBundleExecutable")

            expo_plist: dict[str, Any] | None = None
            if (prefix + "Expo.plist") in namelist:
                raw_expo = plistlib.loads(zf.read(prefix + "Expo.plist"))
                if isinstance(raw_expo, dict):
                    expo_plist = {
                        k: raw_expo[k]
                        for k in ("EXUpdatesCheckOnLaunch", "EXUpdatesEnabled", "EXUpdatesLaunchWaitMs")
                        if k in raw_expo
                    }

            firebase_present = (prefix + "GoogleService-Info.plist") in namelist
            firebase_public_identity: dict[str, Any] = {}
            if firebase_present:
                raw_fb = plistlib.loads(zf.read(prefix + "GoogleService-Info.plist"))
                if isinstance(raw_fb, dict):
                    firebase_public_identity = {
                        k: raw_fb[k]
                        for k in ("BUNDLE_ID", "PROJECT_ID", "GOOGLE_APP_ID", "GCM_SENDER_ID")
                        if k in raw_fb
                    }

            if (prefix + "embedded.mobileprovision") not in namelist:
                raise ValueError("IPA is missing embedded.mobileprovision")
            prov_path = temp_dir / "embedded.mobileprovision"
            profile_plist_path = temp_dir / "profile.plist"
            prov_path.write_bytes(zf.read(prefix + "embedded.mobileprovision"))
            prov_cms = verify_cms_signature(prov_path, profile_plist_path, temp_dir)
            profile = plistlib.loads(profile_plist_path.read_bytes())
            if not isinstance(profile, dict):
                raise ValueError("Provisioning profile plist is invalid")

            dev_certs = profile.get("DeveloperCertificates", [])
            dev_cert_hashes = [sha256_hex(bytes(c)) for c in dev_certs if isinstance(c, (bytes, bytearray))]
            profile_entitlements = profile.get("Entitlements", {})
            if not isinstance(profile_entitlements, dict):
                raise ValueError("Provisioning profile missing Entitlements dictionary")

            provisioning_summary = {
                "Name": profile.get("Name"),
                "UUID": profile.get("UUID"),
                "TeamIdentifier": profile.get("TeamIdentifier"),
                "TeamName": profile.get("TeamName"),
                "CreationDate": str(profile.get("CreationDate")) if profile.get("CreationDate") else None,
                "ExpirationDate": str(profile.get("ExpirationDate")) if profile.get("ExpirationDate") else None,
                "Entitlements": {
                    k: profile_entitlements[k]
                    for k in (
                        "application-identifier",
                        "com.apple.developer.team-identifier",
                        "get-task-allow",
                        "aps-environment",
                        "keychain-access-groups",
                    )
                    if k in profile_entitlements
                },
                "Platform": profile.get("Platform"),
                "ProvisionsAllDevices": bool(profile.get("ProvisionsAllDevices", False)),
                "provisioned_device_count": len(profile.get("ProvisionedDevices", [])),
                "device_identifiers_recorded": False,
                "developer_certificates_sha256": dev_cert_hashes,
            }

            macho_raw = zf.read(prefix + executable_name)
            macho = _extract_macho_slice(macho_raw)
            executable_sha256 = sha256_hex(macho)
            if macho[:4] != b"\xcf\xfa\xed\xfe":
                raise ValueError("Main executable is not a 64-bit Mach-O binary")

            ncmds = struct.unpack_from("<I", macho, 16)[0]
            cmd_offset = 32
            sig_offset: int | None = None
            sig_size: int | None = None
            for _ in range(ncmds):
                cmd, cmdsize = struct.unpack_from("<II", macho, cmd_offset)
                if cmd == 0x1D:  # LC_CODE_SIGNATURE
                    sig_offset, sig_size = struct.unpack_from("<II", macho, cmd_offset + 8)
                cmd_offset += cmdsize

            if sig_offset is None or sig_size is None or sig_offset + sig_size > len(macho):
                raise ValueError("Mach-O LC_CODE_SIGNATURE load command missing or out of bounds")

            superblob = macho[sig_offset : sig_offset + sig_size]
            sb_magic, _sb_length, sb_count = struct.unpack_from(">III", superblob, 0)
            if sb_magic != 0xFADE0CC0:
                raise ValueError("Mach-O code signature SuperBlob magic mismatch")

            blobs: dict[int, bytes] = {}
            for i in range(sb_count):
                slot_type, blob_rel = struct.unpack_from(">II", superblob, 12 + 8 * i)
                blob_magic, blob_len = struct.unpack_from(">II", superblob, blob_rel)
                blobs[slot_type] = superblob[blob_rel : blob_rel + blob_len]

            if 5 not in blobs or 0 not in blobs or 0x10000 not in blobs:
                raise ValueError("Mach-O SuperBlob missing required CodeDirectory, entitlements, or CMS blob")

            signed_entitlements = plistlib.loads(blobs[5][8:])
            if not isinstance(signed_entitlements, dict):
                raise ValueError("Signed executable entitlements did not decode to a dictionary")

            cms_path = temp_dir / "executable-signature.cms"
            cd_path = temp_dir / "CodeDirectory.bin"
            cms_out_path = temp_dir / "cms-verified.out"
            cms_path.write_bytes(blobs[0x10000][8:])
            cd_path.write_bytes(blobs[0])
            exec_cms = verify_cms_signature(cms_path, cms_out_path, temp_dir, content_path=cd_path)

            code_Res_bytes = (
                zf.read(prefix + "_CodeSignature/CodeResources")
                if (prefix + "_CodeSignature/CodeResources") in namelist
                else None
            )

            code_directories: list[dict[str, Any]] = []
            for slot_type, cd_blob in sorted(blobs.items()):
                if len(cd_blob) < 44 or struct.unpack_from(">I", cd_blob, 0)[0] != 0xFADE0C02:
                    continue
                (
                    _magic,
                    _len,
                    _ver,
                    _flags,
                    hash_offset,
                    ident_offset,
                    n_special_slots,
                    n_code_slots,
                    code_limit,
                ) = struct.unpack_from(">9I", cd_blob, 0)
                hash_size, hash_type, _platform, page_shift = struct.unpack_from(">4B", cd_blob, 36)
                hash_name = {1: "sha1", 2: "sha256", 3: "sha256", 4: "sha384"}.get(hash_type)
                if not hash_name:
                    raise ValueError(f"Unsupported CodeDirectory hash type: {hash_type}")
                page_size = 1 << page_shift if page_shift > 0 else code_limit
                bad_pages = []
                for page_idx in range(n_code_slots):
                    chunk = macho[page_idx * page_size : min((page_idx + 1) * page_size, code_limit)]
                    digest = hashlib.new(hash_name, chunk).digest()[:hash_size]
                    expected = cd_blob[
                        hash_offset + page_idx * hash_size : hash_offset + (page_idx + 1) * hash_size
                    ]
                    if digest != expected:
                        bad_pages.append(page_idx)
                if bad_pages or code_limit != sig_offset:
                    raise ValueError("Mach-O CodeDirectory executable page hash mismatch")

                special_matches: dict[str, bool] = {}
                for special_slot, slot_data in [
                    (1, raw_info),
                    (3, code_Res_bytes),
                    (5, blobs.get(5)),
                    (7, blobs.get(7)),
                ]:
                    if slot_data is not None and special_slot <= n_special_slots:
                        expected_special = cd_blob[
                            hash_offset - special_slot * hash_size : hash_offset - (special_slot - 1) * hash_size
                        ]
                        actual_special = hashlib.new(hash_name, slot_data).digest()[:hash_size]
                        if actual_special != expected_special:
                            raise ValueError(f"Mach-O CodeDirectory special slot {special_slot} hash mismatch")
                        special_matches[str(special_slot)] = True

                cd_ident = cd_blob[ident_offset:].split(b"\x00", 1)[0].decode("utf-8", errors="replace")
                code_directories.append(
                    {
                        "slot": slot_type,
                        "hash_algorithm": hash_name,
                        "code_slots": n_code_slots,
                        "code_limit": code_limit,
                        "code_signature_offset": sig_offset,
                        "all_executable_pages_match": True,
                        "special_slot_hash_matches": special_matches,
                        "identifier": cd_ident,
                    }
                )

            if not code_directories:
                raise ValueError("No valid Mach-O CodeDirectory parsed")

            exec_signer_hashes = {
                c["sha256"] for c in exec_cms["verified_signer_certificates"]
            }
            matching_cert_hashes = sorted(exec_signer_hashes & set(dev_cert_hashes))
            if not matching_cert_hashes:
                raise ValueError("Executable CMS signer certificate does not match provisioning profile")

            entitlement_matches = {
                k: profile_entitlements.get(k) == v for k, v in signed_entitlements.items()
            }
            if not all(entitlement_matches.values()):
                raise ValueError("Signed executable entitlements do not match provisioning profile")

            return {
                "platform": "IOS",
                "archive_format": "ipa",
                "size_bytes": file_size,
                "sha256": file_sha256,
                "app_identifier": bundle_id,
                "app_version": str(info.get("CFBundleShortVersionString", "")),
                "app_build_version": str(info.get("CFBundleVersion", "")),
                "info_plist": info_plist_filtered,
                "info_plist_sha256": sha256_hex(raw_info),
                "expo_plist": expo_plist,
                "firebase_plist_present": firebase_present,
                "firebase_public_identity": firebase_public_identity,
                "provisioning_cms_signature": prov_cms,
                "provisioning_profile": provisioning_summary,
                "executable_sha256": executable_sha256,
                "signed_executable_entitlements": signed_entitlements,
                "main_executable_cms_signature": exec_cms,
                "code_directories": code_directories,
                "profile_consistency": {
                    "verified_cms_signers_matching_profile_sha256": matching_cert_hashes,
                    "signed_entitlement_values_match_profile": entitlement_matches,
                    "aps_entitlement_present_in_executable": "aps-environment" in signed_entitlements,
                    "verified_signer_matches_profile": True,
                },
                "signature_verified": True,
                "verification_scope": (
                    "Main Mach-O CMS signature, CodeDirectory page hashes, special slot hashes "
                    "(Info.plist, CodeResources, signed entitlements), and embedded.mobileprovision "
                    "CMS signature plus certificate/entitlement consistency verified. No physical "
                    "device installation or Apple online OCSP/trust-chain check performed."
                ),
            }


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in ("ANDROID", "IOS"):
        sys.stderr.write("Usage: inspect-artifacts.py <ANDROID|IOS> <archive-path>\n")
        return 2
    platform = sys.argv[1]
    archive_path = pathlib.Path(sys.argv[2])
    if not archive_path.is_file():
        sys.stderr.write("Archive file does not exist\n")
        return 2
    try:
        result = inspect_android(archive_path) if platform == "ANDROID" else inspect_ios(archive_path)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"ARTIFACT_INSPECTION_FAILED: {exc}\n")
        return 1
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

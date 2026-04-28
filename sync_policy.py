#!/usr/bin/env python3
# sync_policy.py <settings.json> <repo_url> <ext.pem> [<ext.pem> ...]
# Derives extension IDs from .pem files, regenerates update.xml,
# and syncs mill-owned entries in ExtensionInstallForcelist.
# Owned = any entry pointing to <repo_url>/update.xml.

import sys, json, base64, hashlib, os

settings_path = sys.argv[1]
repo_url = sys.argv[2]
pem_paths = sys.argv[3:]
mill_url = f"{repo_url}/update.xml"

# -- Minimal DER/ASN.1 helpers (no external deps) ----------------------------

def _pem_to_der(pem_path):
	with open(pem_path) as f:
		lines = f.readlines()
	return base64.b64decode(''.join(l.strip() for l in lines if not l.startswith('---')))

def _parse_tlv(buf, off=0):
	"""Return (tag, value_bytes, next_offset) for one TLV at buf[off:]."""
	tag = buf[off]; off += 1
	l	= buf[off]; off += 1
	if l & 0x80:
		n = l & 0x7f
		l = int.from_bytes(buf[off:off+n], 'big')
		off += n
	return tag, buf[off:off+l], off + l

def _iter_seq(body):
	off = 0
	while off < len(body):
		tag, val, off = _parse_tlv(body, off)
		yield tag, val

def _enc_len(n):
	if n < 0x80:
		return bytes([n])
	b = n.to_bytes((n.bit_length() + 7) // 8, 'big')
	return bytes([0x80 | len(b)]) + b

def _tlv(tag, val):  return bytes([tag]) + _enc_len(len(val)) + val
def _seq(*items):	 return _tlv(0x30, b''.join(items))
def _bitstr(val):	 return _tlv(0x03, b'\x00' + val)	# 0 unused bits
def _null():		 return _tlv(0x05, b'')

def _enc_int(n):
	b = n.to_bytes((n.bit_length() + 7) // 8, 'big') if n else b'\x00'
	if b[0] & 0x80:
		b = b'\x00' + b	# positive sign byte
	return _tlv(0x02, b)

# OID 1.2.840.113549.1.1.1	(rsaEncryption)
_RSA_OID = bytes([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])

def _spki_from_rsa_priv_body(body):
	"""Build SubjectPublicKeyInfo DER from the body of an RSAPrivateKey SEQUENCE."""
	items = list(_iter_seq(body))
	# RSAPrivateKey: [version, modulus, publicExponent, ...]
	n = int.from_bytes(items[1][1], 'big')
	e = int.from_bytes(items[2][1], 'big')
	alg_id = _seq(_tlv(0x06, _RSA_OID), _null())
	return _seq(alg_id, _bitstr(_seq(_enc_int(n), _enc_int(e))))

def pub_key_der(pem_path):
	"""Return SubjectPublicKeyInfo DER for any RSA private key PEM."""
	der = _pem_to_der(pem_path)
	with open(pem_path) as f:
		header = f.readline().strip()
	_, body, _ = _parse_tlv(der)		# strip outer SEQUENCE
	if 'RSA' in header:
		# PKCS#1: RSAPrivateKey directly
		return _spki_from_rsa_priv_body(body)
	else:
		# PKCS#8: PrivateKeyInfo -- [version, alg, OCTET STRING(RSAPrivateKey)]
		items	  = list(_iter_seq(body))
		_, rsa_body, _ = _parse_tlv(items[2][1])		# unwrap OCTET STRING
		return _spki_from_rsa_priv_body(rsa_body)

# -- Extension metadata -------------------------------------------------------

def ext_id(pem_path):
	h = hashlib.sha256(pub_key_der(pem_path)).hexdigest()
	return ''.join(chr(ord('a') + int(c, 16)) for c in h[:32])

def ext_name(pem_path):
	return os.path.splitext(os.path.basename(pem_path))[0]

def ext_version(pem_path):
	manifest = os.path.join(os.path.dirname(pem_path), "src", "manifest.json")
	with open(manifest) as f:
		return json.load(f)["version"]

# split args: pems before -- go to settings.json, all pems go to update.xml
if "--" in pem_paths:
	sep = pem_paths.index("--")
	install_pems = pem_paths[:sep]
	all_pems = pem_paths[sep+1:]
else:
	install_pems = pem_paths
	all_pems = pem_paths

extensions_all		= [{"name": ext_name(p), "id": ext_id(p),
				"version": ext_version(p)} for p in all_pems]
extensions_install	= [{"name": ext_name(p), "id": ext_id(p),
				"version": ext_version(p)} for p in install_pems]

# -- update.xml --------------------------------------------------------------
xml_lines = ['<?xml version="1.0" encoding="UTF-8"?>',
			 '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">']
for e in extensions:
	xml_lines.append(f'\t<app appid="{e["id"]}">')
	xml_lines.append(f'\t\t<updatecheck codebase="{repo_url}/{e["name"]}/{e["name"]}.crx" version="{e["version"]}"/>')
	xml_lines.append('\t</app>')
xml_lines.append('</gupdate>')

with open("update.xml", "w") as f:
	f.write("\n".join(xml_lines) + "\n")

# -- settings.json -----------------------------------------------------------
with open(settings_path) as f:
	data = json.load(f)

entries   = data.get("ExtensionInstallForcelist", [])
non_owned = [e for e in entries if len(e.split(";", 1)) < 2 or e.split(";", 1)[1] != mill_url]
owned	  = [f"{e['id']};{mill_url}" for e in extensions]

data["ExtensionInstallForcelist"] = non_owned + owned

with open(settings_path, "w") as f:
	json.dump(data, f, indent="\t")
	f.write("\n")

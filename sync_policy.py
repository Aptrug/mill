#!/usr/bin/env python3
# sync_policy.py <settings.json> <repo_url> <ext.pem> [<ext.pem> ...]
# Derives extension IDs from .pem files, regenerates update.xml,
# and syncs mill-owned entries in ExtensionInstallForcelist.
# Owned = any entry pointing to <repo_url>/update.xml.

import sys, json, hashlib, subprocess, os

settings_path = sys.argv[1]
repo_url	  = sys.argv[2]
pem_paths	  = sys.argv[3:]
mill_url	  = f"{repo_url}/update.xml"

def ext_id(pem_path):
	der = subprocess.check_output(
		["openssl", "rsa", "-in", pem_path, "-pubout", "-outform", "DER"],
		stderr=subprocess.DEVNULL
	)
	h = hashlib.sha256(der).hexdigest()
	return ''.join(chr(ord('a') + int(c, 16)) for c in h[:32])

def ext_name(pem_path):
	return os.path.splitext(os.path.basename(pem_path))[0]

def ext_version(pem_path):
	manifest = os.path.join(os.path.dirname(pem_path), "src", "manifest.json")
	with open(manifest) as f:
		return json.load(f)["version"]

extensions = [{"name": ext_name(p), "id": ext_id(p), "version": ext_version(p)} for p in pem_paths]

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

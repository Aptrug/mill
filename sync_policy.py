#!/usr/bin/env python3
# sync_policy.py <settings.json> <ext_id> [<ext_id> ...]
# Syncs mill-owned entries in ExtensionInstallForcelist.
# Owned = any entry pointing to MILL_URL. Non-owned entries are never touched.

import sys, json, shutil

MILL_URL = "https://raw.githubusercontent.com/Aptrug/mill/master/update.xml"

settings_path = sys.argv[1]
desired_ids   = sys.argv[2:]

with open(settings_path) as f:
    data = json.load(f)

entries   = data.get("ExtensionInstallForcelist", [])
non_owned = [e for e in entries if e.split(";", 1)[1] != MILL_URL]
owned     = [f"{i};{MILL_URL}" for i in desired_ids]

data["ExtensionInstallForcelist"] = non_owned + owned

shutil.copy2(settings_path, settings_path + ".bak")
with open(settings_path, "w") as f:
    json.dump(data, f, indent="\t")
    f.write("\n")

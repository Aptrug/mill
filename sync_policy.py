#!/usr/bin/python3

import sys, json

settings_path = sys.argv[1]
MILL_URL = sys.argv[2]
desired_ids = sys.argv[3:]

with open(settings_path) as f:
	data = json.load(f)

entries = data.get("ExtensionInstallForcelist", [])
non_owned = [e for e in entries if e.split(";", 1)[1] != MILL_URL]
owned = [f"{i};{MILL_URL}" for i in desired_ids]

data["ExtensionInstallForcelist"] = non_owned + owned

with open(settings_path, "w") as f:
	json.dump(data, f, indent="\t")
	f.write("\n")

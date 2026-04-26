#!/usr/bin/env python3
# sync_policy.py -- Sync mill-managed extensions into a Brave/Chrome policy JSON.
#
# Owned entries: any entry whose update URL matches MILL_URL (defined below).
# Non-owned entries: never read, never modified, never removed.
#
# Usage: sync_policy.py <settings.json> <ext_id>[;<ext_id>...]
#	<settings.json>  path to the managed policy JSON file (may be a symlink)
#	<ext_id>...		 one or more extension IDs to ensure are present,
#					 passed as space-separated arguments
#
# The script reads the current IDs from stdin or arguments, computes the
# correct owned set, and writes the file back atomically via a temp file.
#
# Exit codes:
#	0  success (file written or already correct)
#	1  error (printed to stderr)

import sys
import json
import os
import tempfile

# The update URL suffix that identifies a mill-owned entry.
# Any ExtensionInstallForcelist entry whose URL component equals this
# value is considered owned by this script.
MILL_URL = "https://raw.githubusercontent.com/Aptrug/mill/master/update.xml"


def die(msg):
	print(f"sync_policy: error: {msg}", file=sys.stderr)
	sys.exit(1)


def parse_entry(entry):
	"""Split 'id;url' into (id, url). Returns (None, None) on bad format."""
	parts = entry.split(";", 1)
	if len(parts) != 2:
		return None, None
	return parts[0].strip(), parts[1].strip()


def main():
	if len(sys.argv) < 2:
		die(f"usage: {sys.argv[0]} <settings.json> [ext_id ...]")

	settings_path = sys.argv[1]
	desired_ids = list(dict.fromkeys(sys.argv[2:]))  # deduplicate, preserve order

	# -- Read current settings ------------------------------------------------
	if os.path.exists(settings_path):
		with open(settings_path, "r") as f:
			try:
				data = json.load(f)
			except json.JSONDecodeError as e:
				die(f"failed to parse {settings_path}: {e}")
	else:
		data = {}

	if not isinstance(data, dict):
		die(f"{settings_path} top level is not a JSON object")

	current_list = data.get("ExtensionInstallForcelist", [])
	if not isinstance(current_list, list):
		die("ExtensionInstallForcelist is not a JSON array")

	# -- Partition into owned and non-owned entries ---------------------------
	non_owned = []
	for entry in current_list:
		ext_id, url = parse_entry(entry)
		if ext_id is None:
			# Malformed entry -- leave it alone
			non_owned.append(entry)
			continue
		if url != MILL_URL:
			non_owned.append(entry)
		# owned entries are dropped; we rebuild them from desired_ids below

	# -- Build new owned entries ----------------------------------------------
	owned = [f"{ext_id};{MILL_URL}" for ext_id in desired_ids]

	# -- Merge: non-owned first, then owned -----------------------------------
	new_list = non_owned + owned

	# -- Write back only if changed -------------------------------------------
	new_data = dict(data)
	new_data["ExtensionInstallForcelist"] = new_list

	new_json = json.dumps(new_data, indent="\t") + "\n"

	# Check if anything actually changed
	old_json = json.dumps(data, indent="\t") + "\n"
	if new_json == old_json:
		print("sync_policy: nothing to do")
		sys.exit(0)

	# Atomic write via temp file in same directory (preserves symlink target)
	real_path = os.path.realpath(settings_path)
	dir_path = os.path.dirname(real_path)
	try:
		fd, tmp_path = tempfile.mkstemp(dir=dir_path, prefix=".sync_policy_tmp_")
		try:
			with os.fdopen(fd, "w") as f:
				f.write(new_json)
			os.replace(tmp_path, real_path)
		except Exception:
			os.unlink(tmp_path)
			raise
	except PermissionError:
		die(f"permission denied writing to {real_path} -- try sudo")
	except Exception as e:
		die(f"failed to write {real_path}: {e}")

	added = set(desired_ids) - {parse_entry(e)[0] for e in current_list if parse_entry(e)[1] == MILL_URL}
	removed_ids = {parse_entry(e)[0] for e in current_list if parse_entry(e)[1] == MILL_URL} - set(desired_ids)

	for ext_id in sorted(added):
		print(f"sync_policy: added	 {ext_id}")
	for ext_id in sorted(removed_ids):
		print(f"sync_policy: removed {ext_id}")


if __name__ == "__main__":
	main()

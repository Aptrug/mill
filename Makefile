# Requires GNU Make 4.1 or later.
# Builds Chrome/Brave .crx extensions from src/ subdirectories.
# Each extension lives in <name>/src/. Outputs: <name>/<name>.crx,
# <name>/<name>.pem, and a combined update.xml for policy deployment.
# BRAVE_BIN and REPO_URL may be overridden on the command line.

MAKEFLAGS += --no-builtin-rules --no-builtin-variables
.DELETE_ON_ERROR:
.SECONDEXPANSION:

# -- Tools -------------------------------------------------------------------
BRAVE_BIN := brave

# -- User-facing config ------------------------------------------------------
REPO_URL := https://raw.githubusercontent.com/Aptrug/mill/master

# -- Source enumeration (parse-time glob, global scope only) -----------------
# All directories containing a src/ subdirectory are treated as extensions.
EXTENSIONS := $(patsubst %/src/,%,$(wildcard */src/))

# Path to the managed policy JSON (may be a symlink).
SETTINGS_JSON := $(CURDIR)/chrome_settings.json

# Path to the sync script.
SYNC_POLICY   := $(CURDIR)/sync_policy.py

# -- Per-extension derived variables (computed once at parse time) ------------
# ext_id_<name>  : Chromium extension ID derived from the packed public key
# version_<name> : version string extracted from src/manifest.json
# srcs_<name>    : sorted list of source files under src/
$(foreach e,$(EXTENSIONS),\
  $(eval srcs_$e := $(sort $(wildcard $e/src/*)))\
  $(eval version_$e := $(shell grep -oP '"version":\s*"\K[^"]+' $e/src/manifest.json))\
  $(eval ext_id_$e := $(shell openssl rsa -in $e/$e.pem -pubout -outform DER 2>/dev/null \
    | sha256sum | head -c 32 | tr 0-9a-f a-p))\
)

# -- Default goal ------------------------------------------------------------
.PHONY: all
all: $(foreach e,$(EXTENSIONS),$e/$e.crx) update.xml

# -- Extension build rules ---------------------------------------------------
# Explicit rules are generated per extension via $(eval) because GNU Make
# allows only one % wildcard per pattern -- %/%.crx would treat the second
# % as a literal, not a wildcard, and never match.

# pem_rule <name>: first-run rule; brave emits src.pem + src.crx as siblings
# of src/, both are moved into place.
define pem_rule
$1/$1.pem:
	$(BRAVE_BIN) --headless --pack-extension="$1/src" && \
	mv "$1/src.crx" "$1/$1.crx" && \
	mv "$1/src.pem" "$$@"
endef

# crx_rule <name>: rebuild .crx when source files or .pem change.
define crx_rule
$1/$1.crx: $1/$1.pem $(srcs_$1)
	$(BRAVE_BIN) --headless --pack-extension="$1/src" \
	  --pack-extension-key="$$<" && \
	mv "$1/src.crx" "$$@"
endef

$(foreach e,$(EXTENSIONS),$(eval $(call pem_rule,$e)))
$(foreach e,$(EXTENSIONS),$(eval $(call crx_rule,$e)))

# -- update.xml --------------------------------------------------------------
# Lists all extensions for Brave/Chrome policy force-install.
update.xml: $(foreach e,$(EXTENSIONS),$e/$e.crx)
	$(file  > $@,<?xml version="1.0" encoding="UTF-8"?>)
	$(file >> $@,<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">)
	$(foreach e,$(EXTENSIONS),\
	  $(file >> $@,  <app appid="$(ext_id_$e)">)\
	  $(file >> $@,    <updatecheck codebase="$(REPO_URL)/$e/$e.crx" version="$(version_$e)"/>)\
	  $(file >> $@,  </app>)\
	)
	$(file >> $@,</gupdate>)

# Syncs mill-owned extension entries into SETTINGS_JSON.
# Requires sudo if the file is owned by root.


# git add $(foreach e,$(EXTENSIONS),$e/$e.crx) update.xml; \
# git commit -m "release: $(foreach e,$(EXTENSIONS),$e $(version_$e))" ;\
# git push origin master
.PHONY: install
install: $(foreach e,$(EXTENSIONS),$e/$e.crx) update.xml
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL)/update.xml $(foreach e,$(EXTENSIONS),$(ext_id_$e))

.PHONY: uninstall
uninstall:
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL)/update.xml

# -- Policy helper -----------------------------------------------------------
# Prints one "<id>;<update_url>" line per extension, ready to paste into
# the Brave managed policy JSON ExtensionInstallForcelist array.
.PHONY: policy
policy:
	$(foreach e,$(EXTENSIONS),\
	  $(info $(ext_id_$e);$(REPO_URL)/update.xml)\
	)
	@:

# -- Cleanup -----------------------------------------------------------------
.PHONY: clean
clean:
	rm -f $(foreach e,$(EXTENSIONS),$e/$e.crx)

# Removes .pem files and update.xml in addition to clean. WARNING: losing
# a .pem means losing the extension's identity -- it cannot be republished
# under the same ID.
.PHONY: distclean
distclean: clean
	rm -f $(foreach e,$(EXTENSIONS),$e/$e.pem) update.xml

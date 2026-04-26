# Requires GNU Make 4.1 or later.
# Builds Chrome/Brave .crx extensions from src/ subdirectories.
# Each extension lives in <name>/src/. Outputs: <name>/<name>.crx,
# <name>/<name>.pem, and a combined update.xml for policy deployment.
# CHROMIUM_BIN and REPO_URL may be overridden on the command line.

MAKEFLAGS += --no-builtin-rules --no-builtin-variables
.DELETE_ON_ERROR:
.SECONDEXPANSION:
.ONESHELL:

# -- Tools -------------------------------------------------------------------
CHROMIUM_BIN     := google-chrome-stable
CHROMIUM_PROCESS := $(if $(filter google-chrome-stable,$(CHROMIUM_BIN)),chrome,$(CHROMIUM_BIN))

# -- User-facing config ------------------------------------------------------
REPO_URL := https://raw.githubusercontent.com/Aptrug/mill/master

# -- Source enumeration (parse-time glob, global scope only) -----------------
# All directories containing a src/ subdirectory are treated as extensions.
EXTENSIONS := $(patsubst %/src/,%,$(wildcard */src/))

# Path to the managed policy JSON (may be a symlink).
SETTINGS_JSON := $(CURDIR)/$(CHROMIUM_BIN)-settings.json

# Path to the sync script.
SYNC_POLICY   := $(CURDIR)/sync_policy.py

# -- Per-extension derived variables (computed once at parse time) ------------
# ext_id_<name>  : Chromium extension ID derived from the packed public key
# version_<name> : version string extracted from src/manifest.json
# srcs_<name>    : sorted list of source files under src/
$(foreach e,$(EXTENSIONS),\
  $(eval srcs_$e := $(sort $(wildcard $e/src/*)))\
)

# -- Default goal ------------------------------------------------------------
.PHONY: all
all: $(foreach e,$(EXTENSIONS),$e/$e.crx)

# -- Extension build rules ---------------------------------------------------
# Explicit rules are generated per extension via $(eval) because GNU Make
# allows only one % wildcard per pattern -- %/%.crx would treat the second
# % as a literal, not a wildcard, and never match.

# pem_rule <name>: first-run rule; brave emits src.pem + src.crx as siblings
# of src/, both are moved into place.
define pem_rule
$1/$1.pem:
	$(CHROMIUM_BIN) --headless --pack-extension="$1/src"
	mv "$1/src.crx" "$1/$1.crx"
	mv "$1/src.pem" "$$@"
endef

# crx_rule <name>: rebuild .crx when source files or .pem change.
define crx_rule
$1/$1.crx: $1/$1.pem $(srcs_$1)
	$(CHROMIUM_BIN) --headless --pack-extension="$1/src" --pack-extension-key="$$<"
	mv "$1/src.crx" "$$@"
endef

$(foreach e,$(EXTENSIONS),$(eval $(call pem_rule,$e)))
$(foreach e,$(EXTENSIONS),$(eval $(call crx_rule,$e)))


# Syncs mill-owned extension entries into SETTINGS_JSON.
# Requires sudo if the file is owned by root.

.PHONY: install
install: $(foreach e,$(EXTENSIONS),$e/$e.crx)
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL) $(foreach e,$(EXTENSIONS),$e/$e.pem)

# git add $(foreach e,$(EXTENSIONS),$e/$e.crx) update.xml; \
# git commit -m "release: $(foreach e,$(EXTENSIONS),$e $(version_$e))" ;\
# git push origin master
.PHONY: run
run: install
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL)/update.xml
	pkill -x $(CHROMIUM_PROCESS)
	$(CHROMIUM_BIN) &
	sleep 1
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL)/update.xml $(foreach e,$(EXTENSIONS),$(ext_id_$e))
	git add $(foreach e,$(EXTENSIONS),$e/$e.crx) update.xml
	git commit -m "release: $(foreach e,$(EXTENSIONS),$e $(version_$e))"
	git push origin master
	pkill -x $(CHROMIUM_PROCESS)
	# rm -rf ~/.config/google-chrome/ ~/.cache/google-chrome/
	$(CHROMIUM_BIN) &

.PHONY: uninstall
uninstall:
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL)

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

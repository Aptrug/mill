# Requires GNU Make 4.1 or later.
# Builds Chrome/Brave .crx extensions from src/ subdirectories.
# Each extension lives in <name>/src/. Outputs: <name>/<name>.crx,
# <name>/<name>.pem, and a combined update.xml for policy deployment.
# CHROMIUM_BIN and REPO_URL may be overridden on the command line.

MAKEFLAGS += --no-builtin-rules --no-builtin-variables
.DELETE_ON_ERROR:
.ONESHELL:

# -- Tools -------------------------------------------------------------------
CHROMIUM_BIN     := google-chrome-stable
# CHROMIUM_BIN     := brave
CHROMIUM_PROCESS := $(if $(filter google-chrome-stable,$(CHROMIUM_BIN)),chrome,$(CHROMIUM_BIN))

# -- User-facing config ------------------------------------------------------
REPO_URL := https://raw.githubusercontent.com/Aptrug/mill/master

# -- Source enumeration (parse-time glob, global scope only) -----------------
# All directories containing a src/ subdirectory are treated as extensions.
ALL_EXTENSIONS := $(patsubst %/src/,%,$(wildcard */src/))
EXTENSIONS     ?= $(ALL_EXTENSIONS)

# Path to the managed policy JSON (may be a symlink).
SETTINGS_JSON := $(CURDIR)/$(CHROMIUM_BIN)-settings.json

# Path to the sync script.
SYNC_POLICY   := $(CURDIR)/sync_policy.py

# -- Per-extension derived variables (computed once at parse time) ------------
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

# crx_rule <name>: pack extension. Generates .pem on first run if absent.
define crx_rule
$1/$1.crx: $(srcs_$1)
	if [ ! -f "$1/$1.pem" ]; then
		$(CHROMIUM_BIN) --headless --pack-extension="$1/src"
		mv "$1/src.pem" "$1/$1.pem"
	else
		$(CHROMIUM_BIN) --headless --pack-extension="$1/src" --pack-extension-key="$1/$1.pem"
	fi
	mv "$1/src.crx" "$$@"
endef

$(foreach e,$(EXTENSIONS),$(eval $(call crx_rule,$e)))

# Syncs mill-owned extension entries into SETTINGS_JSON.

.PHONY: install
install: $(foreach e,$(EXTENSIONS),$e/$e.crx)
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL) $(foreach e,$(EXTENSIONS),$e/$e.pem)

.PHONY: run
run: install
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL)
	pkill -x $(CHROMIUM_PROCESS) || true
	while pgrep -x $(CHROMIUM_PROCESS) > /dev/null; do sleep 0.5; done
	$(CHROMIUM_BIN) &
	git add $(foreach e,$(EXTENSIONS),$e/$e.crx) update.xml
	git commit -m "release: $(foreach e,$(EXTENSIONS),$e )"
	git push origin master
	pkill -x $(CHROMIUM_PROCESS) || true
	while pgrep -x $(CHROMIUM_PROCESS) > /dev/null; do sleep 0.5; done
	python3 $(SYNC_POLICY) $(SETTINGS_JSON) $(REPO_URL) $(foreach e,$(EXTENSIONS),$e/$e.pem)
	$(CHROMIUM_BIN) &

.PHONY: pack
pack:
	[ -d "$${ATTACHMENTS_DIR}" ] || exit
	rm -rf "$${ATTACHMENTS_DIR}"/*
	tar cf $${ATTACHMENTS_DIR}/files.tar Makefile *.json *.py *.xml */src/*

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

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

# First run: no .pem exists yet; brave generates both .pem and .crx as
# siblings of src/ (i.e. <name>/src.pem and <name>/src.crx). Move both.
%/%.pem:
	$(BRAVE_BIN) --headless --pack-extension="$*/src" && \
	mv "$*/src.crx" "$*/$*.crx" && \
	mv "$*/src.pem" "$@"

# Subsequent runs: .pem exists; rebuild .crx from source files.
# $$(srcs_$$*) expands after % is bound (secondary expansion).
%/%.crx: %/%.pem $$(srcs_$$*)
	$(BRAVE_BIN) --headless --pack-extension="$*/src" \
	  --pack-extension-key="$<" && \
	mv "$*/src.crx" "$@"

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

# -- Policy helper -----------------------------------------------------------
# Prints one "<id>;<update_url>" line per extension, ready to paste into
# the Brave managed policy JSON ExtensionInstallForcelist array.
.PHONY: policy
policy:
	$(foreach e,$(EXTENSIONS),\
	  $(info $(ext_id_$e);$(REPO_URL)/update.xml)\
	)

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

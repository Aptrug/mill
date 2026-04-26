REPO_URL   := https://raw.githubusercontent.com/Aptrug/mill/master
BRAVE_BIN  := brave
EXTENSIONS := $(patsubst %/src/,%,$(wildcard */src/))

# Per-extension paths
pem  = $1/$1.pem
crx  = $1/$1.crx
src  = $1/src
srcs = $(wildcard $1/src/*)
tmp_crx = $1/src.crx
tmp_pem = $1/src.pem
ext_id = $(shell openssl rsa -in "$(call pem,$1)" -pubout -outform DER 2>/dev/null | shasum -a 256 | head -c 32 | tr '0-9a-f' 'a-p')
version = $(shell grep -oP '"version":\s*"\K[^"]+' $(call src,$1)/manifest.json)

.PHONY: all
all: $(EXTENSIONS) update.xml

# Build a single extension by name
.PHONY: $(EXTENSIONS)
$(EXTENSIONS): %: $(call crx,%)

# Generate .pem + .crx on first run
%/%.pem:
	$(BRAVE_BIN) --headless --pack-extension="$(call src,$*)"
	@mv "$(call tmp_crx,$*)" "$(call crx,$*)"
	@mv "$(call tmp_pem,$*)" "$(call pem,$*)"

# Rebuild .crx when source files change
%/%.crx: %/%.pem $(call srcs,%)
	$(BRAVE_BIN) --headless --pack-extension="$(call src,$*)" --pack-extension-key="$(call pem,$*)"
	@mv "$(call tmp_crx,$*)" "$(call crx,$*)"

# Generate combined update.xml
update.xml: $(foreach e,$(EXTENSIONS),$(call crx,$e))
	@printf '<?xml version="1.0" encoding="UTF-8"?>\n'                            > update.xml
	@printf '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n' >> update.xml
	@$(foreach e,$(EXTENSIONS), \
		printf '  <app appid="%s">\n    <updatecheck codebase="%s" version="%s"/>\n  </app>\n' \
		"$(call ext_id,$e)" \
		"$(REPO_URL)/$e/$e.crx" \
		"$(call version,$e)" >> update.xml;)
	@printf '</gupdate>\n'                                                        >> update.xml

.PHONY: policy
policy:
	@$(foreach e,$(EXTENSIONS), \
		echo "$(call ext_id,$e);$(REPO_URL)/update.xml";)

.PHONY: clean
clean:
	@$(foreach e,$(EXTENSIONS), rm -f $(call crx,$e);)

.PHONY: distclean
distclean: clean
	@$(foreach e,$(EXTENSIONS), rm -f $(call pem,$e);)
	@rm -f update.xml

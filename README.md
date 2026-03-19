# discourse-external-link-gate

A Discourse plugin that:

- hides external links from guests
- opens native Discourse login on click
- supports gated content with shortcode
- supports group-restricted content with upgrade CTA

## Shortcodes

### Guests only
```text
[gate]This text is hidden from guests[/gate]

[gate groups="premium,vip" upgrade="/upgrade"]Premium content here[/gate]

[gate groups="premium" upgrade="/pricing" upgrade_message="Upgrade to Premium to view this section." upgrade_button="Upgrade Now"]
Secret content
[/gate]

cd /var/discourse
./launcher rebuild app

Notes
External links are masked for anonymous users at cooked-post serialization time.
Login remains native to Discourse.
Social login buttons only appear if enabled in Discourse.

---

## shortcode usage

### Hide from guests
```text
[gate]This is hidden from guests.[/gate]


[gate groups="premium"]This is premium-only content.[/gate]

[gate groups="premium,vip,subscribers" upgrade="/upgrade"]Paid content[/gate]

## External link allowlist

Admin setting:

- `external_link_gate_exempt_domains`

Examples:

```text
youtube.com
youtu.be
*.trustedpartner.com

cd /var/discourse
./launcher rebuild app

##one command to update from server

cd /var/discourse && rm -rf plugins/discourse-external-link-gate && ./launcher rebuild app

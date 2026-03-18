# discourse-external-link-gate

A Discourse plugin that hides external links in cooked posts from anonymous users and replaces them with Login / Register buttons.

## Features

- Logged-in users see normal external links
- Anonymous users do not see external links
- Internal links stay untouched
- Useful for guest gating and reducing external link exposure to crawlers that see anonymous HTML

## Install

On your Discourse server:

```bash
cd /var/discourse
git clone https://github.com/Greatbenny/discourse-external-link-gate.git plugins/discourse-external-link-gate
./launcher rebuild app

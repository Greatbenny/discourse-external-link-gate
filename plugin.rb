# frozen_string_literal: true

# name: discourse-external-link-gate
# about: Hide external links from guests and show login/register prompts instead
# version: 0.3
# authors: Greatbenny
# url: https://github.com/Greatbenny/discourse-external-link-gate

enabled_site_setting :external_link_gate_enabled

after_initialize do
  module ::DiscourseExternalLinkGate
    PLUGIN_NAME = "discourse-external-link-gate"
  end

  require_relative "lib/discourse_external_link_gate/processor"

  register_asset "stylesheets/common/external-link-gate.scss"

  add_to_serializer(:post, :cooked, false) do
    cooked = object.cooked
    return cooked unless SiteSetting.external_link_gate_enabled

    ::DiscourseExternalLinkGate::Processor.process(
      cooked,
      user: scope&.user,
      base_url: Discourse.base_url
    )
  end
end

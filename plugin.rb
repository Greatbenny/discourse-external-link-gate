# frozen_string_literal: true

# name: discourse-external-link-gate
# about: Replaces external links in cooked posts with login/register prompts for anonymous users
# version: 0.1
# authors: Greatbenny
# url: https://github.com/Greatbenny/discourse-external-link-gate

enabled_site_setting :external_link_gate_enabled

after_initialize do
  module ::DiscourseExternalLinkGate
    PLUGIN_NAME = "discourse-external-link-gate"
  end

  require_relative "lib/discourse_external_link_gate/masker"

  register_asset "stylesheets/common/external-link-gate.scss"

  add_to_serializer(:post, :cooked, false) do
    cooked = object.cooked
    user = scope&.user

    return cooked unless SiteSetting.external_link_gate_enabled
    return cooked if user.present?

    ::DiscourseExternalLinkGate::Masker.mask(
      cooked,
      Discourse.base_url,
      message: SiteSetting.external_link_gate_message,
      login_text: SiteSetting.external_link_gate_login_text,
      register_text: SiteSetting.external_link_gate_register_text
    )
  end
end

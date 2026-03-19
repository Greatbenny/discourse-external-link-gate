# frozen_string_literal: true

require "nokogiri"
require "uri"
require "cgi"

module ::DiscourseExternalLinkGate
  class Processor
    SHORTCODE_REGEX = /\[gate([^\]]*)\](.*?)\[\/gate\]/im

    def self.process(html, user:, base_url:)
      return html if html.blank?

      processed = replace_shortcodes(html, user)
      processed = mask_external_links(processed, user, base_url)
      processed
    end

    def self.replace_shortcodes(html, user)
      html.gsub(SHORTCODE_REGEX) do
        raw_attrs = Regexp.last_match(1).to_s
        inner_html = Regexp.last_match(2).to_s

        attrs = parse_attrs(raw_attrs)
        allowed_groups = attrs["groups"].to_s.split(",").map(&:strip).reject(&:blank?)
        upgrade_url = attrs["upgrade"].presence || SiteSetting.external_link_gate_upgrade_url
        guest_message = attrs["message"].presence || SiteSetting.external_link_gate_hidden_message
        upgrade_message = attrs["upgrade_message"].presence || SiteSetting.external_link_gate_upgrade_message
        upgrade_button_text = attrs["upgrade_button"].presence || SiteSetting.external_link_gate_upgrade_button_text

        if allowed_groups.blank?
          user.present? ? inner_html : guest_block(message: guest_message)
        else
          if authorized_for_groups?(user, allowed_groups)
            inner_html
          elsif user.present?
            upgrade_block(
              message: upgrade_message,
              upgrade_url: upgrade_url,
              upgrade_button_text: upgrade_button_text,
              groups: allowed_groups
            )
          else
            guest_block(message: guest_message)
          end
        end
      end
    end

    def self.mask_external_links(html, user, base_url)
      return html if user.present?

      doc = Nokogiri::HTML5.fragment(html)
      base_host = host_for(base_url)

      doc.css("a[href]").each do |link|
        href = link["href"].to_s.strip
        next if href.blank?
        next if non_http_link?(href)
        next unless external_link?(href, base_host)

        trigger = %(
          <span
            class="elg-link-trigger"
            data-elg-trigger="login"
            data-elg-target-url="#{CGI.escapeHTML(href)}"
            role="button"
            tabindex="0"
          >
            #{CGI.escapeHTML(link.text.presence || href)}
          </span>
        )

        link.replace(trigger)
      end

      doc.to_html
    end

    def self.guest_block(message:)
      %(
        <div class="elg-locked-block" data-elg-trigger="login" role="button" tabindex="0">
          <div class="elg-locked-block__blur"></div>
          <div class="elg-locked-block__card">
            <div class="elg-locked-block__message">#{CGI.escapeHTML(message)}</div>
            <div class="elg-locked-block__button btn btn-primary">Log in / Sign up</div>
          </div>
        </div>
      )
    end

    def self.upgrade_block(message:, upgrade_url:, upgrade_button_text:, groups:)
      %(
        <div class="elg-locked-block elg-locked-block--upgrade" data-elg-trigger="upgrade">
          <div class="elg-locked-block__blur"></div>
          <div class="elg-locked-block__card">
            <div class="elg-locked-block__message">#{CGI.escapeHTML(message)}</div>
            <div class="elg-locked-block__meta">Required group: #{CGI.escapeHTML(groups.join(", "))}</div>
            <a class="elg-locked-block__button btn btn-primary" href="#{CGI.escapeHTML(upgrade_url)}">
              #{CGI.escapeHTML(upgrade_button_text)}
            </a>
          </div>
        </div>
      )
    end

    def self.authorized_for_groups?(user, allowed_groups)
      return false if user.blank?
      return true if user.staff?

      user_group_names = user.groups.pluck(:name).map { |g| g.to_s.downcase.strip }
      allowed = allowed_groups.map { |g| g.to_s.downcase.strip }

      (user_group_names & allowed).any?
    end

    def self.parse_attrs(raw_attrs)
      attrs = {}
      raw_attrs.scan(/(\w+)\s*=\s*"([^"]*)"/).each do |key, value|
        attrs[key] = value
      end
      attrs
    end

    def self.host_for(url)
      URI.parse(url).host
    rescue URI::InvalidURIError
      nil
    end

    def self.non_http_link?(href)
      href.start_with?("#", "/", "mailto:", "tel:")
    end

    def self.external_link?(href, base_host)
      uri = URI.parse(href)
      return false unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
      return false if uri.host.blank?
      return false if base_host.blank?

      normalize_host(uri.host) != normalize_host(base_host)
    rescue URI::InvalidURIError
      false
    end

    def self.normalize_host(host)
      host.to_s.downcase.sub(/\Awww\./, "")
    end
  end
end

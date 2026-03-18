# frozen_string_literal: true

require "nokogiri"
require "uri"
require "cgi"

module ::DiscourseExternalLinkGate
  class Masker
    def self.mask(html, base_url, message:, login_text:, register_text:)
      return html if html.blank?

      doc = Nokogiri::HTML5.fragment(html)
      base_host = host_for(base_url)

      doc.css("a[href]").each do |link|
        href = link["href"].to_s.strip
        next if href.blank?
        next if non_http_link?(href)
        next unless external_link?(href, base_host)

        replacement = build_gate_fragment(
          href: href,
          message: message,
          login_text: login_text,
          register_text: register_text
        )

        link.replace(replacement)
      end

      doc.to_html
    end

    def self.build_gate_fragment(href:, message:, login_text:, register_text:)
      login_url = "/login"
      signup_url = "/signup"

      <<~HTML
        <span class="external-link-gate" data-original-href="#{CGI.escapeHTML(href)}">
          <span class="external-link-gate__message">#{CGI.escapeHTML(message)}</span>
          <span class="external-link-gate__actions">
            <a class="btn btn-primary external-link-gate__login" href="#{login_url}">
              #{CGI.escapeHTML(login_text)}
            </a>
            <a class="btn external-link-gate__register" href="#{signup_url}">
              #{CGI.escapeHTML(register_text)}
            </a>
          </span>
        </span>
      HTML
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

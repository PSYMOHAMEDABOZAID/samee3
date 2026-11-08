import SwiftUI
import WebKit
import WidgetKit
import AppKit

private enum Site {
    static let origin = "samee3.vercel.app"
    static let suite = "group.com.samee3.widgets"
    static let snapshotKey = "samee3_widget_snapshot_v1"
    static func url(_ path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"),
              !path.contains("\\"), !path.contains("\n"), path.count < 1500 else { return nil }
        return URL(string: "https://\(origin)\(path)")
    }
}

@main
struct Samee3MacWidgetApp: App {
    @State private var path = "/widgets"
    var body: some Scene {
        WindowGroup("ويدجت مصحف سميع") {
            WebHost(path: $path)
                .frame(minWidth: 360, minHeight: 450)
                .onOpenURL { url in
                    guard url.scheme == "samee3", url.host == "open",
                          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                          let found = components.queryItems?.first(where: { $0.name == "path" })?.value,
                          Site.url(found) != nil else { return }
                    path = found
                }
        }
    }
}

private struct WebHost: NSViewRepresentable {
    @Binding var path: String
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeNSView(context: Context) -> WKWebView {
        let content = WKUserContentController()
        content.add(context.coordinator, name: "samee3Widgets")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController = content
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        if let url = Site.url(path) { web.load(URLRequest(url: url)) }
        return web
    }
    func updateNSView(_ web: WKWebView, context: Context) {
        guard let url = Site.url(path), web.url?.absoluteString != url.absoluteString,
              context.coordinator.lastPath != path else { return }
        context.coordinator.lastPath = path
        web.load(URLRequest(url: url))
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var lastPath = "/widgets"
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "samee3Widgets", message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == Site.origin,
                  let value = message.body as? String,
                  let data = value.data(using: .utf8), data.count < 48_000,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["version"] as? Int == 1,
                  object["widgets"] is [[String: Any]] else { return }
            UserDefaults(suiteName: Site.suite)?.set(value, forKey: Site.snapshotKey)
            WidgetCenter.shared.reloadAllTimelines()
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https" && url.host == Site.origin { decisionHandler(.allow); return }
            if action.navigationType == .linkActivated, url.scheme == "https" { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
}

import SwiftUI
import WebKit
import WidgetKit

private enum Samee3BridgeConfig {
    static let origin = "samee3.vercel.app"
    static let appGroup = "group.com.samee3.widgets"
    static let storageKey = "samee3_widget_snapshot_v1"
}

@main
struct Samee3App: App {
    @State private var openedPath = "/"

    var body: some Scene {
        WindowGroup {
            Samee3WebView(path: $openedPath)
                .ignoresSafeArea(edges: .bottom)
                .onOpenURL { url in
                    guard url.scheme == "samee3", url.host == "open",
                          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                          let path = components.queryItems?.first(where: { $0.name == "path" })?.value,
                          path.hasPrefix("/"), !path.hasPrefix("//") else { return }
                    openedPath = path
                }
        }
    }
}

struct Samee3WebView: UIViewRepresentable {
    @Binding var path: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let content = WKUserContentController()
        content.add(context.coordinator, name: "samee3Widgets")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController = content
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        load(path, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let expected = URL(string: "https://\(Samee3BridgeConfig.origin)\(path)")
        guard let expected else { return }
        if webView.url?.absoluteString != expected.absoluteString && context.coordinator.lastPath != path {
            context.coordinator.lastPath = path
            webView.load(URLRequest(url: expected))
        }
    }

    private func load(_ path: String, in view: WKWebView) {
        guard path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: "https://\(Samee3BridgeConfig.origin)\(path)") else { return }
        view.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var lastPath = "/"
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "samee3Widgets", message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == Samee3BridgeConfig.origin,
                  let value = message.body as? String,
                  let data = value.data(using: .utf8), data.count < 48_000,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["version"] as? Int == 1,
                  object["widgets"] is [[String: Any]] else { return }
            UserDefaults(suiteName: Samee3BridgeConfig.appGroup)?.set(value, forKey: Samee3BridgeConfig.storageKey)
            WidgetCenter.shared.reloadAllTimelines()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https" && url.host == Samee3BridgeConfig.origin { decisionHandler(.allow); return }
            if navigationAction.navigationType == .linkActivated,
               let scheme = url.scheme, ["https", "http", "mailto"].contains(scheme) {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }
}

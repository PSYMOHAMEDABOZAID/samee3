import SwiftUI
import WidgetKit

private let suite = "group.com.samee3.widgets"
private let key = "samee3_widget_snapshot_v1"

private struct Item: Decodable {
    let id: String
    let title: String
    let subtitle: String
    let detail: String
    let url: String
    let icon: String
    let available: Bool
}
private struct Snapshot: Decodable {
    let version: Int
    let generatedAt: Double
    let theme: String
    let widgets: [Item]
}
private struct WidgetEntry: TimelineEntry {
    let date: Date
    let item: Item
    let theme: String
}

private struct Provider: TimelineProvider {
    let kind: String
    func placeholder(in context: Context) -> WidgetEntry { entry() }
    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) { completion(entry()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let item = entry()
        // iOS decides actual refresh frequency; whenever the app syncs we explicitly reload.
        completion(Timeline(entries: [item], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
    private func entry() -> WidgetEntry {
        let fallback = Item(id: kind, title: "مصحف سميع", subtitle: "افتح التطبيق لتحديث البيانات", detail: "", url: "/widgets", icon: "۞", available: false)
        guard let text = UserDefaults(suiteName: suite)?.string(forKey: key),
              let data = text.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
              snapshot.version == 1 else { return WidgetEntry(date: Date(), item: fallback, theme: "emerald") }
        let item = snapshot.widgets.first(where: { $0.id == kind }) ?? fallback
        return WidgetEntry(date: Date(), item: item, theme: snapshot.theme)
    }
}

private struct ItemView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) private var family
    private var colors: (Color, Color, Color) {
        switch entry.theme {
        case "ivory": return (Color(red: 0.97, green: 0.94, blue: 0.86), Color(red: 0.12, green: 0.26, blue: 0.21), Color(red: 0.38, green: 0.30, blue: 0.14))
        case "midnight": return (Color(red: 0.06, green: 0.10, blue: 0.18), .white, Color(red: 0.92, green: 0.76, blue: 0.44))
        case "sand": return (Color(red: 0.45, green: 0.32, blue: 0.20), .white, Color(red: 0.98, green: 0.83, blue: 0.54))
        case "royal": return (Color(red: 0.10, green: 0.18, blue: 0.38), .white, Color(red: 0.98, green: 0.83, blue: 0.54))
        case "rose": return (Color(red: 0.40, green: 0.22, blue: 0.30), .white, Color(red: 0.98, green: 0.83, blue: 0.54))
        default: return (Color(red: 0.04, green: 0.24, blue: 0.18), .white, Color(red: 0.92, green: 0.76, blue: 0.44))
        }
    }
    private var destination: URL? {
        var parts = URLComponents()
        parts.scheme = "samee3"
        parts.host = "open"
        let safePath = entry.item.url.hasPrefix("/") && !entry.item.url.hasPrefix("//") ? entry.item.url : "/widgets"
        parts.queryItems = [URLQueryItem(name: "path", value: safePath)]
        return parts.url
    }
    var body: some View {
        let (background, foreground, accent) = colors
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("مصحف سميع").font(.caption2).fontWeight(.bold)
                Spacer()
                Text(entry.item.icon).font(.system(size: 19))
            }
            .foregroundColor(accent)
            Spacer(minLength: 0)
            Text(entry.item.title).font(family == .systemSmall ? .headline : .title3).fontWeight(.heavy).lineLimit(1)
            Text(entry.item.subtitle).font(.subheadline).lineLimit(family == .systemSmall ? 2 : 3)
            if family != .systemSmall && !entry.item.detail.isEmpty {
                Text(entry.item.detail).font(.caption).opacity(0.83).lineLimit(2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .foregroundColor(foreground)
        .background(background)
        .environment(\.layoutDirection, .rightToLeft)
        .widgetURL(destination)
    }
}

private struct Samee3Widget: Widget {
    let kind: String
    let title: String
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "samee3.\(kind)", provider: Provider(kind: kind)) { entry in
            ItemView(entry: entry)
        }
        .configurationDisplayName(title)
        .description("ويدجت مصحف سميع — البيانات تتحدث عند فتح التطبيق")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct Samee3WidgetBundle: WidgetBundle {
    @WidgetBundleBuilder var body: some Widget {
        Samee3Widget(kind: "reading", title: "متابعة القراءة")
        Samee3Widget(kind: "ayah", title: "آيتك الأخيرة")
        Samee3Widget(kind: "surahs", title: "فهرس السور")
        Samee3Widget(kind: "audio", title: "المكتبة الصوتية")
        Samee3Widget(kind: "morning", title: "أذكار الصباح")
        Samee3Widget(kind: "evening", title: "أذكار المساء")
        Samee3Widget(kind: "tasbih", title: "عداد التسبيح")
        Samee3Widget(kind: "prayer", title: "الصلاة القادمة")
        Samee3Widget(kind: "hadith", title: "الأحاديث")
        Samee3Widget(kind: "library", title: "المكتبة الشرعية")
        Samee3Widget(kind: "tarbiyah", title: "التربية الإيمانية")
        Samee3Widget(kind: "visual", title: "الآيات المرئية")
        Samee3Widget(kind: "favorites", title: "المحفوظات")
        Samee3Widget(kind: "reminders", title: "التذكيرات")
        Samee3Widget(kind: "messages", title: "التواصل")
        Samee3Widget(kind: "profile", title: "حسابي")
    }
}

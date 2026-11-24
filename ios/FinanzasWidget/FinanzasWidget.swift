import WidgetKit
import SwiftUI

// Widget de Finanzas. Lee el resumen que la app le deja en el grupo compartido (App Group) SOLO si el usuario
// activó «Mostrar saldo en el widget»; si no, ofrece abrir la app o anotar un gasto, sin cifras.
private let appGroup = "group.com.lestudio.finanzas"

struct FinanzasEntry: TimelineEntry {
    let date: Date
    let show: Bool
    let title: String
    let amount: String
    let sub: String
}

private let isSpanish = (Locale.current.languageCode ?? "es") == "es"

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> FinanzasEntry {
        FinanzasEntry(date: Date(), show: true, title: isSpanish ? "Disponible" : "Available", amount: "1.234,56 €", sub: "")
    }

    func getSnapshot(in context: Context, completion: @escaping (FinanzasEntry) -> Void) {
        completion(load())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FinanzasEntry>) -> Void) {
        // La app pide el refresco cuando cambian los datos; esto es solo un respaldo.
        completion(Timeline(entries: [load()], policy: .after(Date().addingTimeInterval(3600))))
    }

    private func load() -> FinanzasEntry {
        let d = UserDefaults(suiteName: appGroup)
        let show = d?.bool(forKey: "show") ?? false
        return FinanzasEntry(
            date: Date(),
            show: show,
            title: d?.string(forKey: "title") ?? (isSpanish ? "Disponible" : "Available"),
            amount: d?.string(forKey: "amount") ?? "—",
            sub: d?.string(forKey: "sub") ?? ""
        )
    }
}

struct FinanzasWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FinanzasEntry

    private var addURL: URL { URL(string: "com.lestudio.finanzas://nuevo")! }
    private var openURL: URL { URL(string: "com.lestudio.finanzas://")! }

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 2) {
            Text(entry.show ? entry.title : "Finanzas")
                .font(.system(size: 13))
                .opacity(0.8)
                .lineLimit(1)
            Text(entry.show ? entry.amount : (isSpanish ? "Abrir" : "Open"))
                .font(.system(size: 26, weight: .bold))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            if entry.show && !entry.sub.isEmpty {
                Text(entry.sub)
                    .font(.system(size: 12))
                    .opacity(0.75)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .foregroundColor(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

        let bg = LinearGradient(colors: [Color(red: 0.08, green: 0.34, blue: 0.77), Color(red: 0.01, green: 0.16, blue: 0.40)], startPoint: .topTrailing, endPoint: .bottomLeading)

        Group {
            if family == .systemMedium {
                HStack(alignment: .center) {
                    content
                    Link(destination: addURL) {
                        ZStack {
                            Circle().fill(Color.white.opacity(0.2))
                            Text("+").font(.system(size: 30, weight: .regular)).foregroundColor(.white)
                        }
                        .frame(width: 52, height: 52)
                    }
                }
                .widgetURL(openURL)
            } else {
                content.widgetURL(openURL)
            }
        }
        .padding(14)
        .widgetBackgroundCompat(bg)
    }
}

extension View {
    @ViewBuilder
    func widgetBackgroundCompat<B: View>(_ bg: B) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { bg }
        } else {
            self.background(bg)
        }
    }
}

@main
struct FinanzasWidget: Widget {
    let kind = "FinanzasWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FinanzasWidgetView(entry: entry)
        }
        .configurationDisplayName("Finanzas")
        .description(isSpanish ? "Tu saldo disponible y un botón para anotar un gasto." : "Your available balance and a button to log an expense.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

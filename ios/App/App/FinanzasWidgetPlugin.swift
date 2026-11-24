import Foundation
import Capacitor
import WidgetKit

/// Puente entre la app web y el widget: guarda el resumen en el App Group y recarga el widget.
/// Sin permiso del usuario («show» = false) no se guarda ninguna cifra.
@objc(FinanzasWidgetPlugin)
public class FinanzasWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FinanzasWidgetPlugin"
    public let jsName = "FinanzasWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        let d = UserDefaults(suiteName: "group.com.lestudio.finanzas")
        let show = call.getBool("show") ?? false
        d?.set(show, forKey: "show")
        if show {
            d?.set(call.getString("title") ?? "", forKey: "title")
            d?.set(call.getString("amount") ?? "—", forKey: "amount")
            d?.set(call.getString("sub") ?? "", forKey: "sub")
        } else {
            d?.removeObject(forKey: "title")
            d?.removeObject(forKey: "amount")
            d?.removeObject(forKey: "sub")
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}

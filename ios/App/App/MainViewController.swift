import UIKit
import Capacitor

/// Controlador principal: registra el plugin local del widget.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FinanzasWidgetPlugin())
    }
}

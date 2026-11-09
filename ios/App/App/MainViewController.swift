import UIKit
import Capacitor

/// Registers app-local Capacitor plugins. Main.storyboard must point at this class
/// (see docs/ios-storefront-link.md).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StorefrontPlugin())
    }
}

import Foundation
import Capacitor
import StoreKit

/// Reports the App Store storefront country (ISO 3166-1 alpha-3, "USA" for the US).
/// The web layer uses it to show the website upgrade link ONLY on the US storefront
/// (App Review Guideline 3.1.1(a) / 3.1.3). Returns no code when unknown; the JS side then
/// hides the link. See docs/ios-storefront-link.md for the Xcode steps that enable this file.
@objc(StorefrontPlugin)
public class StorefrontPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorefrontPlugin"
    public let jsName = "Storefront"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCountryCode", returnType: CAPPluginReturnPromise)
    ]

    @objc func getCountryCode(_ call: CAPPluginCall) {
        Task {
            let code: String?
            if let storefront = await Storefront.current {
                code = storefront.countryCode
            } else {
                code = nil
            }
            if let code = code, !code.isEmpty {
                call.resolve(["countryCode": code])
            } else {
                call.resolve([:])
            }
        }
    }
}

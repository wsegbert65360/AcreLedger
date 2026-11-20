import UIKit
import Capacitor

/// UIScene lifecycle (required when building with the iOS 27 SDK / Xcode 27).
///
/// Unlike the stock Capacitor 8.5 template, this does NOT build a plain
/// CAPBridgeViewController in code. The scene manifest in Info.plist points at
/// Main.storyboard, whose initial view controller is MainViewController — that
/// subclass registers StorefrontPlugin, so it must stay the root.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // UIKit normally creates the window from Main.storyboard before this runs.
        // Fallback only if it didn't (e.g. storyboard entry removed later).
        if window == nil {
            let window = UIWindow(windowScene: windowScene)
            window.rootViewController = MainViewController()
            window.makeKeyAndVisible()
            self.window = window
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

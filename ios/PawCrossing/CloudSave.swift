import Foundation
import React

/// iCloud key-value storage for the save game (NSUbiquitousKeyValueStore, up to 1 MB).
/// JS: src/platform/cloudsave.ts. Every method resolves; errors mean "no iCloud" and the game keeps using MMKV.
@objc(CloudSave)
class CloudSave: RCTEventEmitter {
  private let store = NSUbiquitousKeyValueStore.default
  private var hasListeners = false

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self, selector: #selector(changed(_:)),
      name: NSUbiquitousKeyValueStore.didChangeExternallyNotification, object: store)
    store.synchronize()
  }

  deinit { NotificationCenter.default.removeObserver(self) }

  @objc static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { ["CloudSaveChanged"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc private func changed(_ note: Notification) {
    if hasListeners { sendEvent(withName: "CloudSaveChanged", body: nil) }
  }

  @objc(get:resolver:rejecter:)
  func get(_ key: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(store.string(forKey: key))
  }

  @objc(set:value:resolver:rejecter:)
  func set(_ key: String, value: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    store.set(value, forKey: key)
    resolve(store.synchronize())
  }

  @objc(synchronize:rejecter:)
  func synchronize(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(store.synchronize())
  }
}

package com.cctechsupport.drts.driver

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

private const val MODULE_NAME = "DRTSDriverMapConfig"

private class DriverMapConfigModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = MODULE_NAME

  override fun getConstants(): Map<String, Any> = mapOf(
    "googleMapsConfigured" to reactApplicationContext.getString(R.string.driver_google_maps_key).isNotBlank()
  )
}

class DriverMapConfigPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == MODULE_NAME) DriverMapConfigModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(MODULE_NAME to ReactModuleInfo(
      MODULE_NAME, DriverMapConfigModule::class.java.name,
      canOverrideExistingModule = false, needsEagerInit = false, isCxxModule = false, isTurboModule = false
    ))
  }
}

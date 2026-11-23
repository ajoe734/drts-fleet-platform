const { withPassengerIosFirebasePodfile } = module.require(
  "./with-passenger-firebase.cjs",
);

/**
 * Unconditionally configures iOS Podfile post_install settings for RNFB*
 * pods when built under expo-build-properties ios.useFrameworks="static",
 * preventing Xcode non-modular React-Core header inclusion errors in RNFBApp
 * and RNFBMessaging even when PASSENGER_GOOGLE_SERVICES_IOS_FILE is omitted.
 */
module.exports = withPassengerIosFirebasePodfile;

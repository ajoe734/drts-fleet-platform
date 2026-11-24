#import "DRTSDriverMapConfig.h"
#import <React/RCTBridgeModule.h>
#if __has_include(<GoogleMaps/GoogleMaps.h>)
#import <GoogleMaps/GoogleMaps.h>
#endif

@interface DRTSDriverMapConfig () <RCTBridgeModule>
@end

@implementation DRTSDriverMapConfig
RCT_EXPORT_MODULE(DRTSDriverMapConfig)

static BOOL googleMapsConfigured = NO;

+ (void)configure
{
#if __has_include(<GoogleMaps/GoogleMaps.h>)
  NSURL *resource = [[NSBundle mainBundle] URLForResource:@"DRTSDriverGoogleMaps" withExtension:@"txt"];
  if (resource != nil) {
    NSString *key = [NSString stringWithContentsOfURL:resource encoding:NSUTF8StringEncoding error:NULL];
    if (key.length > 0) {
      googleMapsConfigured = [GMSServices provideAPIKey:key];
    }
  }
#endif
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
  return @{@"googleMapsConfigured": @(googleMapsConfigured)};
}
@end

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.workbranch.app',
  appName: 'WorkBranch',
  webDir: '../../packages/frontend/dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'http',
    url: 'http://localhost:3000',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;

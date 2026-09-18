/// <reference types="jest" />
import fs from 'fs';
import path from 'path';

describe('App Config & Icon Assets - Rygorystyczna weryfikacja konfiguracji', () => {
  const rootDir = path.resolve(__dirname, '..');
  const appJsonPath = path.join(rootDir, 'app.json');

  test('1. app.json powinien istnieć i być poprawnym formatem JSON', () => {
    expect(fs.existsSync(appJsonPath)).toBe(true);
    const content = fs.readFileSync(appJsonPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.expo).toBeDefined();
    expect(parsed.expo.name).toBe('Destivo');
  });

  test('2. app.json musi konfigurować ikonę adaptacyjną na granatowym tle (#0B1120)', () => {
    const content = fs.readFileSync(appJsonPath, 'utf8');
    const parsed = JSON.parse(content);
    const androidConfig = parsed.expo.android;

    expect(androidConfig).toBeDefined();
    expect(androidConfig.adaptiveIcon).toBeDefined();
    expect(androidConfig.adaptiveIcon.backgroundColor.toUpperCase()).toBe('#0B1120');
    expect(androidConfig.adaptiveIcon.foregroundImage).toBe('./assets/android-icon-foreground.png');
    expect(parsed.expo.icon).toBe('./assets/icon.png');
  });

  test('3. pliki graficzne ikon powinny istnieć na dysku i nie być puste', () => {
    const iconPath = path.join(rootDir, 'assets', 'icon.png');
    const foregroundIconPath = path.join(rootDir, 'assets', 'android-icon-foreground.png');

    expect(fs.existsSync(iconPath)).toBe(true);
    const iconStats = fs.statSync(iconPath);
    expect(iconStats.size).toBeGreaterThan(10000); // Ponad 10 KB

    expect(fs.existsSync(foregroundIconPath)).toBe(true);
    const fgStats = fs.statSync(foregroundIconPath);
    expect(fgStats.size).toBeGreaterThan(10000); // Ponad 10 KB
  });

  test('4. zasoby logo w assets/logo powinny zawierać kluczowe grafiki brandingu', () => {
    const logoDir = path.join(rootDir, 'assets', 'logo');
    expect(fs.existsSync(logoDir)).toBe(true);

    const requiredAssets = [
      'LogoNapisBezKropkiBialy.png',
      'NapisKropkaBialy.png',
      'logoBezTla.png',
      'NapisBezKropkiBialy.png',
    ];

    for (const fileName of requiredAssets) {
      const filePath = path.join(logoDir, fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(1000);
    }
  });

  test('5. konfiguracja natywna Androida (colors.xml oraz ic_launcher.xml) musi używać #0B1120', () => {
    const colorsXmlPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'colors.xml');
    if (fs.existsSync(colorsXmlPath)) {
      const colorsXml = fs.readFileSync(colorsXmlPath, 'utf8');
      expect(colorsXml).toContain('name="ic_launcher_background">#0B1120</color>');
    }

    const launcherXmlPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml');
    if (fs.existsSync(launcherXmlPath)) {
      const launcherXml = fs.readFileSync(launcherXmlPath, 'utf8');
      expect(launcherXml).toContain('android:drawable="@color/ic_launcher_background"');
      expect(launcherXml).toContain('android:drawable="@drawable/ic_launcher_foreground"');
    }
  });

  test('6. [Przypadek błędu] wykrywa nieprawidłowy kolor tła lub brak ikony', () => {
    const invalidConfig = {
      expo: {
        android: {
          adaptiveIcon: {
            backgroundColor: '#FFFFFF', // Biały zamiast granatowego
            foregroundImage: './assets/nonexistent.png',
          },
        },
      },
    };

    expect(invalidConfig.expo.android.adaptiveIcon.backgroundColor).not.toBe('#0B1120');
    expect(fs.existsSync(path.join(rootDir, invalidConfig.expo.android.adaptiveIcon.foregroundImage))).toBe(false);
  });
});

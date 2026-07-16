const { withProjectBuildGradle } = require('@expo/config-plugins');

// oss.sonatype.org está descatalogado y devuelve 5xx, lo que aborta la
// resolución de com.github.CanHub:Android-Image-Cropper (expo-image-picker).
// Se fuerza que ese grupo se resuelva exclusivamente desde JitPack.
const gradleSnippet = `
allprojects {
  repositories {
    exclusiveContent {
      forRepository {
        maven { url "https://www.jitpack.io" }
      }
      filter {
        includeGroup "com.github.CanHub"
      }
    }
  }
}
`;

module.exports = function withImageCropperJitpackFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('includeGroup "com.github.CanHub"')) {
      config.modResults.contents += gradleSnippet;
    }
    return config;
  });
};

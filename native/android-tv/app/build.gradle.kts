plugins {
    id("com.android.application")
}

android {
    namespace = "app.samee3.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.samee3.tv"
        minSdk = 21
        targetSdk = 35
        versionCode = 2
        versionName = "1.1.0"
    }

    signingConfigs {
        create("samee3TvRelease") {
            // Loaded from GitHub Actions secrets. Never store a private key in the repository.
            storeFile = file(System.getenv("SAMEE3_TV_KEYSTORE_PATH") ?: "missing-signee3-tv-key.jks")
            storePassword = System.getenv("SAMEE3_TV_STORE_PASSWORD") ?: ""
            keyAlias = System.getenv("SAMEE3_TV_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("SAMEE3_TV_KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("samee3TvRelease")
        }
        getByName("debug") {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-dev"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

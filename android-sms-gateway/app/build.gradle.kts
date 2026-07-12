plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.cucinapopolare.gateway"
    compileSdk = 36

    defaultConfig {
        applicationId = "it.cucinapopolare.gateway"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
}

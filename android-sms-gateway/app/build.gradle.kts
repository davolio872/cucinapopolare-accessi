plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.cucinapopolare.gateway"
    compileSdk = 36

    defaultConfig {
        applicationId = "it.cucinapopolare.gateway"
        minSdk = 23
        targetSdk = 36
        versionCode = 4
        versionName = "0.2.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

kotlin {
    jvmToolchain(21)
}

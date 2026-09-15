plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

android { namespace = "br.com.concursosaltinho"; compileSdk = 35
    defaultConfig { applicationId = "br.com.concursosaltinho"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "1.0"; buildConfigField("String", "APP_URL", "\"https://concurso-saltinho-api.onrender.com\"") }
    buildFeatures { buildConfig = true }
}
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}

pluginManagement {
    plugins {
        kotlin("android") version "1.9.25"
        id("com.android.application") version "8.2.2"
        id("com.android.library") version "8.2.2"
        id("com.google.gms.google-services") version "4.3.15"
    }
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://maven.google.com") }
        maven { url = uri("https://jitpack.io") }
    }
}

rootProject.name = "child-app"
include(":shared")
include(":androidApp")

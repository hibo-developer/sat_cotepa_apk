# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using
# the proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ---- Capacitor / Android ----
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * { @com.getcapacitor.annotation.* <methods>; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# ---- WebView JS interfaces (no exponemos ninguna, pero por seguridad) ----
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# ---- Conservar lineas para stack traces ----
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---- Supabase / OkHttp (dependencias transitivas) ----
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# ---- Keep nombres de modelos serializados si se anaden ----
#-keep class com.cotepa.sat.model.** { *; }

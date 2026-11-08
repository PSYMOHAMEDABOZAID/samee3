ملحق WidgetKit الأصلي للماك (macOS 13+)
المشروع الموجود في native/macos/ هو تطبيق Electron الحالي؛ لم يتم استبداله.
هذا مشروع Swift مستقل لتقديم ويدجت macOS الأصلية مع المضيف Samee3MacApp.
يلزم Mac + Xcode وXcodeGen ثم: cd native-widgets/macos && xcodegen generate && open Samee3MacWidgets.xcodeproj
اضبط Apple Development Team وApp Groups entitlement لنفس الفريق والمجموعة في كل target.
قم بتثبيت المضيف على Mac ثم افتحه مرة واحدة لحفظ محتوى الويدجت، وبعدها اضفها من سطح المكتب.
لا يعمل نشر الكود في GitHub وحده على تثبيت هذا الملحق أو تحديث تطبيق Electron الحالي.
لا تقم بتحميل هذا التطبيق قبل اختبار signing ومطابقة Bundle identifiers مع تطبيقك النهائي.

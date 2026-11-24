#!/usr/bin/env ruby
# Añade al proyecto de Xcode (ios/App/App.xcodeproj) la extensión del widget y los archivos del plugin.
# Es idempotente: si ya existe, no hace nada. Requiere la gema xcodeproj (viene con CocoaPods).
#   ruby scripts/add-ios-widget.rb
require 'xcodeproj'

proj_path = File.expand_path('../ios/App/App.xcodeproj', __dir__)
proj = Xcodeproj::Project.open(proj_path)
app = proj.targets.find { |t| t.name == 'App' } or abort('No encuentro el target App')

if proj.targets.any? { |t| t.name == 'FinanzasWidget' }
  puts 'La extensión del widget ya está en el proyecto.'
  exit 0
end

# --- archivos nuevos del target App (plugin + controlador) ---
app_group = proj.main_group['App']
%w[MainViewController.swift FinanzasWidgetPlugin.swift].each do |f|
  ref = app_group.files.find { |x| x.path == f } || app_group.new_file(f)
  app.add_file_references([ref]) unless app.source_build_phase.files_references.include?(ref)
end
app_group.new_file('App.entitlements') unless app_group.files.any? { |x| x.path == 'App.entitlements' }
app.build_configurations.each { |c| c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' }

# --- extensión del widget ---
ext = proj.new_target(:app_extension, 'FinanzasWidget', :ios, '15.0')
group = proj.main_group.new_group('FinanzasWidget', '../FinanzasWidget')
swift = group.new_file('FinanzasWidget.swift')
group.new_file('Info.plist')
group.new_file('FinanzasWidget.entitlements')
ext.add_file_references([swift])
ext.add_system_framework('WidgetKit')
ext.add_system_framework('SwiftUI')
ext.build_configurations.each do |c|
  c.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.lestudio.finanzas.widget',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'INFOPLIST_FILE' => '../FinanzasWidget/Info.plist',
    'CODE_SIGN_ENTITLEMENTS' => '../FinanzasWidget/FinanzasWidget.entitlements',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1',
    'IPHONEOS_DEPLOYMENT_TARGET' => '15.0',
    'SKIP_INSTALL' => 'YES',
    'MARKETING_VERSION' => '1.0',
    'CURRENT_PROJECT_VERSION' => '1',
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks'],
  )
end

# Incrustar la extensión dentro de la app y depender de ella.
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(ext.product_reference, true)
bf.settings = { 'ATTRIBUTES' => %w[RemoveHeadersOnCopy] }
app.add_dependency(ext)

proj.save
puts 'Extensión del widget añadida.'

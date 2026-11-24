#!/usr/bin/env ruby
# Firma manual por target para el archivo de la App Store (solo en CI): la app y la extensión del widget
# usan perfiles distintos. Uso: ruby scripts/set-ios-signing.rb <TEAM_ID> <perfil app> <perfil widget>
require 'xcodeproj'
team, app_profile, widget_profile = ARGV
abort('Uso: set-ios-signing.rb TEAM PERFIL_APP PERFIL_WIDGET') unless team && app_profile && widget_profile
proj = Xcodeproj::Project.open(File.expand_path('../ios/App/App.xcodeproj', __dir__))
{ 'App' => app_profile, 'FinanzasWidget' => widget_profile }.each do |name, profile|
  t = proj.targets.find { |x| x.name == name } or abort("No encuentro #{name}")
  t.build_configurations.select { |c| c.name == 'Release' }.each do |c|
    c.build_settings.merge!('CODE_SIGN_STYLE' => 'Manual', 'DEVELOPMENT_TEAM' => team, 'CODE_SIGN_IDENTITY' => 'Apple Distribution', 'PROVISIONING_PROFILE_SPECIFIER' => profile)
  end
end
proj.save

#define AppVersion "2.2.0"
#define PayloadDir GetEnv("YOUCHORDS_WINDOWS_PAYLOAD")

[Setup]
AppId={{B7651DC2-9C2B-49FE-969B-E31ED4E423C4}}
AppName=YouChords Local for Windows
AppVersion={#AppVersion}
AppPublisher=YouChords
DefaultDirName={localappdata}\Programs\YouChords Local
DefaultGroupName=YouChords Local
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=YouChords-Local-Windows-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=YouChords Local for Windows
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#PayloadDir}\uv.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\processor\*.py"; DestDir: "{app}\processor"; Flags: ignoreversion
Source: "{#PayloadDir}\processor\requirements.windows*.txt"; DestDir: "{app}\processor"; Flags: ignoreversion
Source: "{#PayloadDir}\wheels\*"; DestDir: "{app}\wheels"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\sonic-annotator\*"; DestDir: "{app}\sonic-annotator"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\vamp_plugins_windows\*"; DestDir: "{app}\vamp_plugins_windows"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\licenses\*"; DestDir: "{app}\licenses"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\scripts\install_windows_runtime.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\scripts\start_windows.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\scripts\start_windows.vbs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "YouChords-Windows-Quick-Start.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Start YouChords Windows Processor"; Filename: "{app}\scripts\start_windows.vbs"; WorkingDir: "{app}"
Name: "{userstartup}\YouChords Local Windows"; Filename: "{app}\scripts\start_windows.vbs"; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\install_windows_runtime.ps1"" -AppRoot ""{app}"" -DataRoot ""{localappdata}\YouChordsLocal"""; StatusMsg: "Installing the local Python and AI processing runtime. This may take a while..."; Flags: waituntilterminated
Filename: "{sys}\wscript.exe"; Parameters: """{app}\scripts\start_windows.vbs"""; Description: "Start the YouChords Windows processor now"; Flags: postinstall nowait skipifsilent

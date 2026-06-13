using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Threading;

namespace JediyLauncher
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                Assembly assembly = Assembly.GetExecutingAssembly();
                string launcherPath = assembly.Location;
                
                // Use the EXE's write time as a unique version identifier
                DateTime writeTime = File.GetLastWriteTime(launcherPath);
                string folderSuffix = writeTime.ToString("yyyyMMddHHmmss");
                
                string tempDir = Path.Combine(Path.GetTempPath(), "Je-DIY_Portable_" + folderSuffix);
                string exePath = Path.Combine(tempDir, "Je-DIY.exe");
                string sentinelPath = Path.Combine(tempDir, "extraction_complete.txt");
                
                // 1. Extract files if not already done or if previous extraction was incomplete
                if (!Directory.Exists(tempDir) || !File.Exists(exePath) || !File.Exists(sentinelPath))
                {
                    // If directory existed partially, recreate it clean
                    if (Directory.Exists(tempDir))
                    {
                        try { Directory.Delete(tempDir, true); } catch { }
                    }
                    Directory.CreateDirectory(tempDir);
                    
                    // Get embedded ZIP resource
                    using (Stream resourceStream = assembly.GetManifestResourceStream("app.zip"))
                    {
                        if (resourceStream == null)
                        {
                            throw new Exception("L'archive de l'application (app.zip) est introuvable dans les ressources.");
                        }
                        
                        string tempZip = Path.Combine(tempDir, "app.zip");
                        using (FileStream fileStream = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                        {
                            resourceStream.CopyTo(fileStream);
                        }
                        
                        // Extract ZIP contents
                        ZipFile.ExtractToDirectory(tempZip, tempDir);
                        
                        // Cleanup ZIP file
                        try { File.Delete(tempZip); } catch { }
                        
                        // Create sentinel file to mark successful extraction
                        File.WriteAllText(sentinelPath, "Extraction completed successfully at " + DateTime.Now.ToString());
                    }
                }
                
                // 2. Launch the Electron app
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = exePath;
                if (args != null && args.Length > 0)
                {
                    startInfo.Arguments = string.Join(" ", args);
                }
                startInfo.WorkingDirectory = tempDir;
                startInfo.UseShellExecute = false;
                
                Process.Start(startInfo);
                
                // 3. Background cleanup of older versions
                ThreadPool.QueueUserWorkItem((state) => {
                    try
                    {
                        string tempRoot = Path.GetTempPath();
                        foreach (string dir in Directory.GetDirectories(tempRoot, "Je-DIY_Portable_*"))
                        {
                            if (dir != tempDir)
                            {
                                try
                                {
                                    Directory.Delete(dir, true);
                                }
                                catch
                                {
                                    // Directory locked because another version is still running
                                }
                            }
                        }
                    }
                    catch { }
                });
            }
            catch (Exception ex)
            {
                System.Windows.Forms.MessageBox.Show(
                    "Impossible de démarrer Je-DIY :\n\n" + ex.Message,
                    "Erreur de démarrage",
                    System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error
                );
            }
        }
    }
}

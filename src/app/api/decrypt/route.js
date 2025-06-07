import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, unlink, readdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const key = formData.get('key');

    if (!file || !key) {
      return NextResponse.json({ error: 'File and key are required' }, { status: 400 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'cpp-backend', 'uploads');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    // Save uploaded encrypted file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const inputFilePath = path.join(uploadsDir, `encrypted_${Date.now()}_${file.name}`);
    const outputDir = path.join(uploadsDir, `output_${Date.now()}`);

    // Create output directory
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    await writeFile(inputFilePath, buffer);

    // Execute C++ program for decryption using command line arguments
    const cppExecutable = path.join(process.cwd(), 'cpp-backend', 'encryptor');
    
    try {
      const { stdout, stderr } = await execAsync(`"${cppExecutable}" decrypt "${inputFilePath}" "${outputDir}" "${key}"`, {
        cwd: path.join(process.cwd(), 'cpp-backend')
      });
      
      console.log('C++ stdout:', stdout);
      if (stderr) console.log('C++ stderr:', stderr);

      // Find the decrypted file in the output directory
      const files = await readdir(outputDir);
      if (files.length === 0) {
        throw new Error('No decrypted file found');
      }

      const decryptedFileName = files[0];
      const decryptedFilePath = path.join(outputDir, decryptedFileName);
      const decryptedData = await readFile(decryptedFilePath);

      // Clean up temporary files
      await unlink(inputFilePath);
      await unlink(decryptedFilePath);
      
      // Try to remove the output directory (will only work if empty)
      try {
        await rmdir(outputDir);
      } catch (rmdirError) {
        // Ignore rmdir errors as directory might not be empty
      }

      // Return the decrypted file
      return new NextResponse(decryptedData, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${decryptedFileName}"`,
        },
      });

    } catch (execError) {
      // Clean up files in case of error
      try {
        await unlink(inputFilePath);
        // Try to clean up output directory
        try {
          const files = await readdir(outputDir);
          for (const file of files) {
            await unlink(path.join(outputDir, file));
          }
          await rmdir(outputDir);
        } catch (cleanupError) {
          console.error('Output directory cleanup error:', cleanupError);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      
      console.error('C++ execution error:', execError);
      return NextResponse.json({ error: 'Decryption failed - check your key and file format' }, { status: 500 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Import rmdir for cleanup
import { rmdir } from 'fs/promises';
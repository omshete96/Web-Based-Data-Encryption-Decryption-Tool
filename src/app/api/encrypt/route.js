import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, unlink } from 'fs/promises';
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

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const inputFilePath = path.join(uploadsDir, `input_${Date.now()}_${file.name}`);
    const outputFilePath = path.join(uploadsDir, `output_${Date.now()}_${file.name}.enc`);

    await writeFile(inputFilePath, buffer);

    // Execute C++ program for encryption using command line arguments
    const cppExecutable = path.join(process.cwd(), 'cpp-backend', 'encryptor');
    
    try {
      const { stdout, stderr } = await execAsync(`"${cppExecutable}" encrypt "${inputFilePath}" "${outputFilePath}" "${key}"`, {
        cwd: path.join(process.cwd(), 'cpp-backend')
      });
      
      console.log('C++ stdout:', stdout);
      if (stderr) console.log('C++ stderr:', stderr);

      // Read the encrypted file
      const encryptedData = await readFile(outputFilePath);

      // Clean up temporary files
      await unlink(inputFilePath);
      await unlink(outputFilePath);

      // Return the encrypted file
      return new NextResponse(encryptedData, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.name}.enc"`,
        },
      });

    } catch (execError) {
      // Clean up files in case of error  
      try {
        await unlink(inputFilePath);
        if (existsSync(outputFilePath)) {
          await unlink(outputFilePath);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      
      console.error('C++ execution error:', execError);
      return NextResponse.json({ error: 'Encryption failed' }, { status: 500 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
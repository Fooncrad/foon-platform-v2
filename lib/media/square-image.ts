import sharp from 'sharp';
export async function squareImage(bytes:Buffer){
 if(!bytes.length||bytes.length>10*1048576)throw Error('IMAGE_TOO_LARGE');
 const image=sharp(bytes,{limitInputPixels:16000000,animated:false}),metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format??'')||(metadata.pages??1)>1)throw Error('INVALID_IMAGE');
 return image.rotate().resize(800,800,{fit:'cover',position:'centre'}).jpeg({quality:82,mozjpeg:true}).toBuffer();
}

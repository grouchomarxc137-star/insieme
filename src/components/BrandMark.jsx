// The lovebirds logo: two birds forming a heart, wearing crowns.
export default function BrandMark({ size = 28 }) {
  return (
    <img
      src="/logo.png"
      alt="Lovissimi"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '22%', objectFit: 'cover' }}
    />
  );
}

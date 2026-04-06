import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FileText, Upload, X, Search, PenTool, Image as ImageIcon, Camera } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

export default function App() {
  const [formData, setFormData] = useState({
    nome: '',
    identidade: '',
    orgaoExpedidor: '',
    cpf: '',
    nomeMae: '',
    nomePai: '',
    dataNascimento: '',
    naturalidade: '',
    nacionalidade: '',
    profissao: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    email: '',
    telefone: '',
  });

  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<'upload' | 'draw'>('upload');
  const sigCanvas = useRef<SignatureCanvas>(null);
  
  const [idDocument, setIdDocument] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cep') {
      const cepFormatted = value.replace(/\D/g, '');
      setFormData({ ...formData, cep: cepFormatted });
      if (cepFormatted.length === 8) {
        fetchAddress(cepFormatted);
      }
    } else if (name === 'cpf') {
      // Formatação básica de CPF
      let cpfFormatted = value.replace(/\D/g, '');
      if (cpfFormatted.length > 11) cpfFormatted = cpfFormatted.slice(0, 11);
      cpfFormatted = cpfFormatted.replace(/(\d{3})(\d)/, '$1.$2');
      cpfFormatted = cpfFormatted.replace(/(\d{3})(\d)/, '$1.$2');
      cpfFormatted = cpfFormatted.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      setFormData({ ...formData, cpf: cpfFormatted });
    } else if (name === 'telefone') {
      // Formatação básica de telefone
      let telFormatted = value.replace(/\D/g, '');
      if (telFormatted.length > 11) telFormatted = telFormatted.slice(0, 11);
      if (telFormatted.length > 2) {
        telFormatted = `(${telFormatted.slice(0, 2)}) ${telFormatted.slice(2)}`;
      }
      if (telFormatted.length > 10) {
        telFormatted = `${telFormatted.slice(0, 10)}-${telFormatted.slice(10)}`;
      }
      setFormData({ ...formData, telefone: telFormatted });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const fetchAddress = async (cep: string) => {
    setIsLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          endereco: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          estado: data.uf || '',
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsLoadingCep(false);
    }
  };

  const processSignatureImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          if (a < 50) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 0;
            continue;
          }

          const mixedR = (r * a + 255 * (255 - a)) / 255;
          const mixedG = (g * a + 255 * (255 - a)) / 255;
          const mixedB = (b * a + 255 * (255 - a)) / 255;
          
          const brightness = (mixedR * 299 + mixedG * 587 + mixedB * 114) / 1000;
          
          if (brightness > 200) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 0; 
          } else {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            const alpha = Math.min(255, Math.floor(((200 - brightness) / 200) * 255) * 1.5);
            data[i + 3] = alpha;
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string | null>>, processTransparent: boolean = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (processTransparent) {
          const processedImage = await processSignatureImage(reader.result as string);
          setter(processedImage);
        } else {
          setter(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSignatureCanvas = () => {
    sigCanvas.current?.clear();
    setSignatureImage(null);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // --- Logo ---
    if (logoImage) {
      try {
        doc.addImage(logoImage, 'PNG', 85, 15, 40, 40);
      } catch (e) {
        console.error("Error adding logo image to PDF", e);
      }
    } else {
      // --- Clean Vector Logo ---
      const centerX = 105;
      const centerY = 35;
      
      doc.setDrawColor(0);
      doc.setFillColor(255, 255, 255);
      
      // Outer circles
      doc.setLineWidth(0.8);
      doc.circle(centerX, centerY, 22, 'S');
      doc.setLineWidth(0.3);
      doc.circle(centerX, centerY, 19, 'S');
      
      // Inner filled circle for contrast
      doc.setFillColor(0, 0, 0);
      doc.circle(centerX, centerY, 14, 'F');
      
      // Text around the circle (simplified approach: text at top and bottom)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text('TROPA VASCAÍNA', centerX, centerY - 15, { align: 'center' });
      doc.text('TERESÓPOLIS', centerX, centerY + 17, { align: 'center' });
      
      // Side letters
      doc.setFontSize(12);
      doc.text('C R', centerX - 16, centerY + 2, { align: 'center' });
      doc.text('V G', centerX + 16, centerY + 2, { align: 'center' });
      
      // Center Cross (Maltese cross simplified)
      doc.setFillColor(255, 255, 255);
      const crossSize = 4;
      doc.triangle(centerX, centerY, centerX - crossSize, centerY - crossSize, centerX + crossSize, centerY - crossSize, 'F'); // Top
      doc.triangle(centerX, centerY, centerX - crossSize, centerY + crossSize, centerX + crossSize, centerY + crossSize, 'F'); // Bottom
      doc.triangle(centerX, centerY, centerX - crossSize, centerY - crossSize, centerX - crossSize, centerY + crossSize, 'F'); // Left
      doc.triangle(centerX, centerY, centerX + crossSize, centerY - crossSize, centerX + crossSize, centerY + crossSize, 'F'); // Right
    }

    // --- Title ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('CADASTRO DE SÓCIO', 105, 65, { align: 'center' });

    // --- DADOS PESSOAIS HEADER ---
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS PESSOAIS', 20, 85);
    doc.setLineWidth(0.5);
    doc.line(20, 87, 190, 87);

    // --- Fields ---
    const drawField = (label: string, value: string, x: number, y: number, totalWidth: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      const labelWidth = doc.getTextWidth(label) + 2;
      doc.text(label, x, y);

      doc.setLineWidth(0.2);
      doc.setDrawColor(150, 150, 150);
      doc.line(x + labelWidth, y + 1, x + totalWidth, y + 1);

      if (value) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        // Truncate value if it's too long for the line
        const maxValueWidth = totalWidth - labelWidth - 2;
        let displayValue = value;
        while (doc.getTextWidth(displayValue) > maxValueWidth && displayValue.length > 0) {
          displayValue = displayValue.slice(0, -1);
        }
        doc.text(displayValue, x + labelWidth + 2, y - 0.5);
      }
    };

    let y = 98;
    drawField('NOME COMPLETO:', formData.nome.toUpperCase(), 20, y, 170);
    
    y += 12;
    drawField('IDENTIDADE Nº:', formData.identidade, 20, y, 80);
    drawField('ÓRGÃO EXPEDIDOR:', formData.orgaoExpedidor.toUpperCase(), 105, y, 85);
    
    y += 12;
    drawField('CPF Nº:', formData.cpf, 20, y, 170);
    
    y += 12;
    const filiacaoCombinada = [formData.nomeMae, formData.nomePai].filter(Boolean).join(' E ').toUpperCase();
    drawField('FILIAÇÃO:', filiacaoCombinada, 20, y, 170);
    
    y += 12;
    let formattedDate = formData.dataNascimento;
    if (formattedDate) {
      const [year, month, day] = formattedDate.split('-');
      if (year && month && day) {
        formattedDate = `${day}/${month}/${year}`;
      }
    }
    drawField('DATA DE NASCIMENTO:', formattedDate, 20, y, 80);
    drawField('NATURALIDADE:', formData.naturalidade.toUpperCase(), 105, y, 85);
    
    y += 12;
    drawField('NACIONALIDADE:', formData.nacionalidade.toUpperCase(), 20, y, 80);
    drawField('PROFISSÃO:', formData.profissao.toUpperCase(), 105, y, 85);
    
    y += 12;
    drawField('CEP:', formData.cep, 20, y, 50);
    drawField('ENDEREÇO:', formData.endereco.toUpperCase(), 75, y, 115);
    
    y += 12;
    drawField('NÚMERO:', formData.numero, 20, y, 40);
    drawField('COMPLEMENTO:', formData.complemento.toUpperCase(), 65, y, 125);
    
    y += 12;
    drawField('BAIRRO:', formData.bairro.toUpperCase(), 20, y, 80);
    drawField('CIDADE:', formData.cidade.toUpperCase(), 105, y, 85);
    
    y += 12;
    drawField('ESTADO:', formData.estado.toUpperCase(), 20, y, 80);
    drawField('TELEFONE:', formData.telefone, 105, y, 85);
    
    y += 12;
    drawField('E-MAIL:', formData.email.toLowerCase(), 20, y, 170);

    // --- Signature ---
    y += 45;
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(40, y, 170, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('ASSINATURA DO SÓCIO', 105, y + 5, { align: 'center' });
    
    let finalSignature = signatureImage;
    if (signatureType === 'draw' && sigCanvas.current && !sigCanvas.current.isEmpty()) {
      finalSignature = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
    }

    if (finalSignature) {
      try {
        doc.addImage(finalSignature, 'PNG', 65, y - 22, 80, 28);
      } catch (e) {
        console.error("Error adding signature image to PDF", e);
      }
    }

    // --- Footer ---
    y += 35;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('USO EXCLUSIVO DA DIRETORIA', 105, y, { align: 'center' });
    
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('ASSOCIADO DESDE', 20, y);
    doc.setLineWidth(0.2);
    doc.line(45, y, 80, y);
    
    doc.text('CATEGORIA', 85, y);
    doc.line(105, y, 140, y);
    
    doc.text('MATRÍCULA', 145, y);
    doc.line(165, y, 190, y);

    // --- ID Document Page ---
    if (idDocument) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('DOCUMENTO DE IDENTIDADE ANEXADO', 105, 20, { align: 'center' });
      
      try {
        const imgProps = doc.getImageProperties(idDocument);
        const pdfWidth = doc.internal.pageSize.getWidth() - 40;
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        doc.addImage(idDocument, 'JPEG', 20, 30, pdfWidth, Math.min(pdfHeight, doc.internal.pageSize.getHeight() - 40));
      } catch (e) {
        console.error("Error adding ID document to PDF", e);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Erro ao carregar a imagem do documento.', 105, 40, { align: 'center' });
      }
    }

    doc.save('cadastro_socio.pdf');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto p-8 bg-white shadow-2xl rounded-2xl border border-gray-100">
        
        <div className="text-center mb-10 relative">
          <div className="flex flex-col items-center justify-center mb-6">
            {logoImage ? (
              <div className="relative group">
                <img src={logoImage} alt="Logo" className="h-24 object-contain" />
                <button 
                  onClick={() => setLogoImage(null)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="cursor-pointer group flex flex-col items-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-100 text-gray-400 mb-2 shadow-inner border-2 border-dashed border-gray-300 group-hover:border-black group-hover:text-black transition-colors">
                  <ImageIcon size={32} />
                </div>
                <span className="text-xs font-bold text-gray-500 group-hover:text-black uppercase tracking-wider">Adicionar Logo</span>
                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={(e) => handleImageUpload(e, setLogoImage)} />
              </label>
            )}
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight uppercase">Cadastro de Sócio</h1>
          <p className="mt-2 text-sm text-gray-500">Preencha os dados abaixo e anexe sua assinatura para gerar sua ficha profissional em PDF.</p>
        </div>
        
        <div className="space-y-8">
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-black pb-2 mb-6 uppercase tracking-wider">Dados Pessoais</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-12">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Nome Completo</label>
                <input type="text" name="nome" value={formData.nome} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Identidade Nº</label>
                <input type="text" name="identidade" value={formData.identidade} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Órgão Expedidor</label>
                <input type="text" name="orgaoExpedidor" value={formData.orgaoExpedidor} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-12">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">CPF Nº</label>
                <input type="text" name="cpf" value={formData.cpf} onChange={handleChange} placeholder="000.000.000-00" maxLength={14} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Nome da Mãe</label>
                <input type="text" name="nomeMae" value={formData.nomeMae} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Nome do Pai</label>
                <input type="text" name="nomePai" value={formData.nomePai} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Data de Nascimento</label>
                <input type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Naturalidade</label>
                <input type="text" name="naturalidade" value={formData.naturalidade} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Nacionalidade</label>
                <input type="text" name="nacionalidade" value={formData.nacionalidade} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-12">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Profissão</label>
                <input type="text" name="profissao" value={formData.profissao} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-black pb-2 mb-6 uppercase tracking-wider">Endereço e Contato</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-4 relative">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">CEP</label>
                <div className="relative">
                  <input type="text" name="cep" value={formData.cep} onChange={handleChange} maxLength={8} placeholder="Apenas números" className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 pl-10 border border-gray-300 bg-gray-50 transition-colors" />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {isLoadingCep ? (
                      <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full"></div>
                    ) : (
                      <Search size={16} className="text-gray-400" />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Digite o CEP para preencher o endereço</p>
              </div>

              <div className="md:col-span-8">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Endereço (Rua/Av)</label>
                <input type="text" name="endereco" value={formData.endereco} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Número</label>
                <input type="text" name="numero" value={formData.numero} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>

              <div className="md:col-span-8">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Complemento</label>
                <input type="text" name="complemento" value={formData.complemento} onChange={handleChange} placeholder="Apto, Bloco, etc." className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Bairro</label>
                <input type="text" name="bairro" value={formData.bairro} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Cidade</label>
                <input type="text" name="cidade" value={formData.cidade} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Estado</label>
                <input type="text" name="estado" value={formData.estado} onChange={handleChange} maxLength={2} placeholder="UF" className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors uppercase" />
              </div>
              
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">E-mail</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
              
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Telefone</label>
                <input type="text" name="telefone" value={formData.telefone} onChange={handleChange} placeholder="(00) 00000-0000" maxLength={15} className="w-full rounded-md shadow-sm focus:ring-black focus:border-black p-2.5 border border-gray-300 bg-gray-50 transition-colors" />
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-black pb-2 mb-6 uppercase tracking-wider">Documento de Identidade</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 flex flex-col items-center justify-center transition-all hover:border-gray-400">
              {idDocument ? (
                <div className="relative w-full max-w-md flex flex-col items-center">
                  <div className="relative w-full h-48 bg-white border border-gray-200 rounded shadow-sm flex items-center justify-center overflow-hidden">
                    <img src={idDocument} alt="Documento de Identidade" className="max-h-full max-w-full object-contain" />
                  </div>
                  <button 
                    onClick={() => setIdDocument(null)}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm font-bold text-sm"
                  >
                    <X size={16} />
                    Remover Documento
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-md text-center">
                  <div className="mx-auto h-14 w-14 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 mb-4">
                    <Camera className="h-6 w-6 text-gray-600" />
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors shadow-md font-bold text-sm">
                    <span>Anexar Foto do Documento</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, setIdDocument)} />
                  </label>
                  <p className="mt-3 text-xs text-gray-500 font-medium">Tire uma foto agora ou envie um arquivo de imagem (RG, CNH, etc).</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 border-b-2 border-black pb-2 mb-4 uppercase tracking-wider">Assinatura</h2>
            
            <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
              <button 
                onClick={() => setSignatureType('upload')}
                className={`px-4 py-2 text-sm font-bold rounded-md flex items-center gap-2 transition-colors ${signatureType === 'upload' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <Upload size={16} />
                Enviar Foto
              </button>
              <button 
                onClick={() => setSignatureType('draw')}
                className={`px-4 py-2 text-sm font-bold rounded-md flex items-center gap-2 transition-colors ${signatureType === 'draw' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <PenTool size={16} />
                Desenhar na Tela
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 sm:p-8 bg-gray-50 flex flex-col items-center justify-center min-h-[250px] transition-all hover:border-gray-400">
              {signatureType === 'upload' ? (
                signatureImage ? (
                  <div className="relative w-full max-w-md flex flex-col items-center">
                    <div className="relative w-full h-48 bg-white border border-gray-200 rounded shadow-sm flex items-center justify-center overflow-hidden">
                      <div className="absolute w-3/4 h-px bg-gray-300 top-3/4"></div>
                      <img src={signatureImage} alt="Assinatura" className="absolute z-10 max-h-full max-w-full object-contain drop-shadow-sm" />
                    </div>
                    <button 
                      onClick={() => setSignatureImage(null)}
                      className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm font-bold text-sm"
                    >
                      <X size={18} />
                      Remover Imagem
                    </button>
                  </div>
                ) : (
                  <div className="w-full max-w-md text-center">
                    <div className="mx-auto h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200 mb-4">
                      <Upload className="h-8 w-8 text-gray-600" />
                    </div>
                    <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors shadow-md font-bold">
                      <span>Fazer upload da assinatura</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setSignatureImage, true)} />
                    </label>
                    <p className="mt-4 text-sm text-gray-600 font-medium">Envie uma foto da sua assinatura em papel branco.</p>
                    <p className="mt-1 text-xs text-gray-400">O fundo será removido automaticamente para um resultado realista no PDF.</p>
                  </div>
                )
              ) : (
                <div className="w-full flex flex-col items-center">
                  <div className="w-full max-w-lg bg-white border border-gray-300 rounded-lg shadow-inner relative overflow-hidden">
                    <div className="absolute w-3/4 h-px bg-gray-200 top-3/4 left-1/2 -translate-x-1/2 pointer-events-none"></div>
                    <SignatureCanvas 
                      ref={sigCanvas}
                      penColor="black"
                      canvasProps={{className: 'w-full h-48 sm:h-64 cursor-crosshair'}}
                      backgroundColor="rgba(255,255,255,0)"
                    />
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button 
                      onClick={clearSignatureCanvas}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-bold text-sm"
                    >
                      Limpar
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-gray-500">Assine usando o mouse, dedo ou caneta touch.</p>
                </div>
              )}
            </div>
          </section>

          <div className="pt-8 flex justify-end">
            <button 
              onClick={generatePDF}
              className="flex items-center gap-3 px-10 py-4 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 text-lg w-full sm:w-auto justify-center"
            >
              <Download size={24} />
              Gerar Ficha em PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

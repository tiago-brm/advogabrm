import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FilePlus,
  FileX,
  MoreHorizontal,
  Calendar,
  User,
  Download,
  HardDrive,
} from "lucide-react";
import { DocumentoForm } from "@/components/documentos/DocumentoForm";
import { DeleteDocumentoDialog } from "@/components/documentos/DeleteDocumentoDialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Documento = {
  id: string;
  name: string;
  clienteId: string | null;
  relatedTo: string;
  size: number | null;
  storagePath: string;
  createdAt: Date;
};

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export default function Documentos() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [documentoToDelete, setDocumentoToDelete] = useState<Documento | null>(
    null
  );
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);

  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        const [clientesRes, docsRes] = await Promise.all([
          supabase.from("clientes").select("id, nome").order("nome"),
          supabase
            .from("documentos")
            .select("*")
            .order("created_at", { ascending: false }),
        ]);

        if (clientesRes.error) console.error(clientesRes.error);
        if (docsRes.error) throw docsRes.error;

        const clientesData = (clientesRes.data || []) as {
          id: string;
          nome: string;
        }[];
        setClientes(clientesData);

        setDocumentos(
          (docsRes.data || []).map((d: any) => ({
            id: d.id,
            name: d.nome,
            clienteId: d.cliente_id,
            relatedTo:
              clientesData.find((c) => c.id === d.cliente_id)?.nome || "-",
            size: d.tamanho,
            storagePath: d.storage_path,
            createdAt: new Date(d.created_at),
          }))
        );
      } catch (e) {
        console.error(e);
        toast.error("Erro ao carregar documentos");
      }
    };
    load();
  }, []);

  const filteredDocumentos = useMemo(() => {
    return documentos
      .filter(
        (doc) =>
          doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.relatedTo.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [documentos, searchTerm]);

  const handleAddDocumento = async (data: {
    clienteId: string;
    file: File;
  }) => {
    if (!user?.id) {
      toast.error("Usuário não autenticado");
      return;
    }
    try {
      const path = `${user.id}/${crypto.randomUUID()}-${data.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(path, data.file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: inserted, error } = await supabase
        .from("documentos")
        .insert({
          nome: data.file.name,
          storage_path: path,
          tamanho: data.file.size,
          user_id: user.id,
          cliente_id: data.clienteId || null,
        })
        .select("*")
        .single();
      if (error) throw error;

      const clienteNome =
        clientes.find((c) => c.id === inserted!.cliente_id)?.nome || "-";
      setDocumentos((prev) => [
        {
          id: inserted!.id,
          name: inserted!.nome,
          clienteId: inserted!.cliente_id,
          relatedTo: clienteNome,
          size: inserted!.tamanho,
          storagePath: inserted!.storage_path,
          createdAt: new Date(inserted!.created_at),
        },
        ...prev,
      ]);
      toast.success("Documento adicionado com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao fazer upload do documento");
    }
  };

  const handleDelete = (doc: Documento) => {
    setDocumentoToDelete(doc);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!documentoToDelete) {
      setIsDeleteDialogOpen(false);
      return;
    }
    try {
      const { error: storageError } = await supabase.storage
        .from("documentos")
        .remove([documentoToDelete.storagePath]);
      if (storageError)
        console.warn("Erro ao excluir do storage", storageError);

      const { error } = await supabase
        .from("documentos")
        .delete()
        .eq("id", documentoToDelete.id);
      if (error) throw error;

      setDocumentos((prev) =>
        prev.filter((d) => d.id !== documentoToDelete.id)
      );
      toast.success("Documento excluído com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir documento");
    } finally {
      setIsDeleteDialogOpen(false);
      setDocumentoToDelete(null);
    }
  };

  const handleDownload = async (doc: Documento) => {
    try {
      const { data, error } = await supabase.storage
        .from("documentos")
        .createSignedUrl(doc.storagePath, 60);
      if (error || !data?.signedUrl) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao baixar documento");
    }
  };
  return (
    <div className="p-3 sm:p-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div>
              <CardTitle className="text-xl sm:text-2xl">Documentos</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Gerencie os documentos do seu escritório.
              </CardDescription>
            </div>
            <Button
              onClick={() => setIsFormOpen(true)}
              className="w-full sm:w-auto"
            >
              <FilePlus className="mr-2 h-4 w-4" />
              Adicionar Documento
            </Button>
          </div>
          <div className="pt-3 sm:pt-4">
            <Input
              placeholder="Pesquisar por nome ou item relacionado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm sm:text-base px-3 py-2"
            />
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Arquivo</TableHead>
                  <TableHead>Relacionado a</TableHead>
                  <TableHead>Data de Upload</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocumentos.length > 0 ? (
                  filteredDocumentos.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.name}</TableCell>
                      <TableCell>{doc.relatedTo}</TableCell>
                      <TableCell>
                        {doc.createdAt.toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>{formatBytes(doc.size || 0)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Abrir menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleDownload(doc)}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Baixar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(doc)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <FileX className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      Nenhum documento encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredDocumentos.length > 0 ? (
              filteredDocumentos.map((doc) => (
                <Card key={doc.id} className="p-3">
                  <CardHeader className="p-0 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm leading-tight truncate">
                          {doc.name}
                        </h3>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="h-8 w-8 p-0 flex-shrink-0"
                          >
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDownload(doc)}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(doc)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <FileX className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{doc.relatedTo}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{doc.createdAt.toLocaleDateString("pt-BR")}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <HardDrive className="h-3 w-3" />
                      <span>{formatBytes(doc.size || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="p-6">
                <div className="text-center text-muted-foreground">
                  Nenhum documento encontrado.
                </div>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

      <DocumentoForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleAddDocumento}
        clientes={clientes}
      />

      {documentoToDelete && (
        <DeleteDocumentoDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
